//
// Copyright(C) 2005-2014 Simon Howard
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// DESCRIPTION:
//     Querying servers to find their current status.
//

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "i_system.h"
#include "i_timer.h"
#include "m_misc.h"

#include "net_common.h"
#include "net_defs.h"
#include "net_io.h"
#include "net_packet.h"
#include "net_query.h"
#include "net_structrw.h"
#include "net_websockets.h"

// DNS address of the Internet master server.

#define MASTER_SERVER_ADDRESS "master.chocolate-doom.org:2342"

// Time to wait for a response before declaring a timeout.

#define QUERY_TIMEOUT_SECS 2

// Time to wait for secure demo signatures before declaring a timeout.

#define SIGNATURE_TIMEOUT_SECS 5

// Number of query attempts to make before giving up on a server.

#define QUERY_MAX_ATTEMPTS 3

typedef enum {
    QUERY_TARGET_SERVER,   // Normal server target.
    QUERY_TARGET_BROADCAST // Send a broadcast query
} query_target_type_t;

typedef enum {
    QUERY_TARGET_QUEUED,    // Query not yet sent
    QUERY_TARGET_QUERIED,   // Query sent, waiting response
    QUERY_TARGET_RESPONDED, // Response received
    QUERY_TARGET_NO_RESPONSE
} query_target_state_t;

typedef struct {
    query_target_type_t type;
    query_target_state_t state;
    net_addr_t *addr;
    net_querydata_t data;
    unsigned int ping_time;
    unsigned int query_time;
    unsigned int query_attempts;
    boolean printed;
} query_target_t;

static net_context_t *query_context;
static query_target_t *targets;
static int num_targets;

static boolean query_loop_running = false;
static boolean printed_header = false;
static int last_query_time = 0;

// Given the specified address, find the target associated.  If no
// target is found, and 'create' is true, a new target is created.

static query_target_t *GetTargetForAddr(net_addr_t *addr, boolean create)
{
    query_target_t *target;
    int i;

    for (i = 0; i < num_targets; ++i) {
        if (targets[i].addr == addr) {
            return &targets[i];
        }
    }

    if (!create) {
        return NULL;
    }

    targets = I_Realloc(targets, sizeof(query_target_t) * (num_targets + 1));

    target = &targets[num_targets];
    target->type = QUERY_TARGET_SERVER;
    target->state = QUERY_TARGET_QUEUED;
    target->printed = false;
    target->query_attempts = 0;
    target->addr = addr;
    NET_ReferenceAddress(addr);
    ++num_targets;

    return target;
}

static void FreeTargets(void)
{
    int i;

    for (i = 0; i < num_targets; ++i) {
        NET_ReleaseAddress(targets[i].addr);
    }
    free(targets);
    targets = NULL;
    num_targets = 0;
}

// Transmit a query packet

static void NET_Query_SendQuery(net_addr_t *addr)
{
    net_packet_t *request;

    request = NET_NewPacket(10);
    NET_WriteInt16(request, NET_PACKET_TYPE_QUERY);

    if (addr == NULL) {
        NET_SendBroadcast(query_context, request);
    }
    else {
        NET_SendPacket(addr, request);
    }

    NET_FreePacket(request);
}

static void NET_Query_ParseResponse(net_addr_t *addr, net_packet_t *packet, net_query_callback_t callback,
                                    void *user_data)
{
    unsigned int packet_type;
    net_querydata_t querydata;
    query_target_t *target;

    // Read the header

    if (!NET_ReadInt16(packet, &packet_type) || packet_type != NET_PACKET_TYPE_QUERY_RESPONSE) {
        return;
    }

    // Read query data

    if (!NET_ReadQueryData(packet, &querydata)) {
        return;
    }

    // Find the target that responded.

    target = GetTargetForAddr(addr, false);

    // If the target is not found, it may be because we are doing
    // a LAN broadcast search, in which case we need to create a
    // target for the new responder.

    if (target == NULL) {
        query_target_t *broadcast_target;

        broadcast_target = GetTargetForAddr(NULL, false);

        // Not in broadcast mode, unexpected response that came out
        // of nowhere. Ignore.

        if (broadcast_target == NULL || broadcast_target->state != QUERY_TARGET_QUERIED) {
            return;
        }

        // Create new target.

        target = GetTargetForAddr(addr, true);
        target->state = QUERY_TARGET_QUERIED;
        target->query_time = broadcast_target->query_time;
    }

    if (target->state != QUERY_TARGET_RESPONDED) {
        target->state = QUERY_TARGET_RESPONDED;
        memcpy(&target->data, &querydata, sizeof(net_querydata_t));

        // Calculate RTT.

        target->ping_time = I_GetTimeMS() - target->query_time;

        // Invoke callback to signal that we have a new address.

        callback(addr, &target->data, target->ping_time, user_data);
    }
}

static void NET_Query_ParsePacket(net_addr_t *addr, net_packet_t *packet, net_query_callback_t callback,
                                  void *user_data)
{
    query_target_t *target;

    // This might be the master server responding.

    target = GetTargetForAddr(addr, false);

    NET_Query_ParseResponse(addr, packet, callback, user_data);
}

static void NET_Query_GetResponse(net_query_callback_t callback, void *user_data)
{
    net_addr_t *addr;
    net_packet_t *packet;

    if (NET_RecvPacket(query_context, &addr, &packet)) {
        NET_Query_ParsePacket(addr, packet, callback, user_data);
        NET_ReleaseAddress(addr);
        NET_FreePacket(packet);
    }
}

// Find a target we have not yet queried and send a query.

static void SendOneQuery(void)
{
    unsigned int now;
    unsigned int i;

    now = I_GetTimeMS();

    // Rate limit - only send one query every 50ms.

    if (now - last_query_time < 50) {
        return;
    }

    for (i = 0; i < num_targets; ++i) {
        // Not queried yet?
        // Or last query timed out without a response?

        if (targets[i].state == QUERY_TARGET_QUEUED ||
            (targets[i].state == QUERY_TARGET_QUERIED && now - targets[i].query_time > QUERY_TIMEOUT_SECS * 1000)) {
            break;
        }
    }

    if (i >= num_targets) {
        return;
    }

    // Found a target to query.  Send a query; how to do this depends on
    // the target type.

    switch (targets[i].type) {
    case QUERY_TARGET_SERVER:
        NET_Query_SendQuery(targets[i].addr);
        break;

    case QUERY_TARGET_BROADCAST:
        NET_Query_SendQuery(NULL);
        break;
    }

    // printf("Queried %s\n", NET_AddrToString(targets[i].addr));
    targets[i].state = QUERY_TARGET_QUERIED;
    targets[i].query_time = now;
    ++targets[i].query_attempts;

    last_query_time = now;
}

// Time out servers that have been queried and not responded.

static void CheckTargetTimeouts(void)
{
    unsigned int i;
    unsigned int now;

    now = I_GetTimeMS();

    for (i = 0; i < num_targets; ++i) {
        /*
        printf("target %i: state %i, queries %i, query time %i\n",
               i, targets[i].state, targets[i].query_attempts,
               now - targets[i].query_time);
        */

        // We declare a target to be "no response" when we've sent
        // multiple query packets to it (QUERY_MAX_ATTEMPTS) and
        // received no response to any of them.

        if (targets[i].state == QUERY_TARGET_QUERIED && targets[i].query_attempts >= QUERY_MAX_ATTEMPTS &&
            now - targets[i].query_time > QUERY_TIMEOUT_SECS * 1000) {
            targets[i].state = QUERY_TARGET_NO_RESPONSE;
        }
    }
}

// If all targets have responded or timed out, returns true.

static boolean AllTargetsDone(void)
{
    unsigned int i;

    for (i = 0; i < num_targets; ++i) {
        if (targets[i].state != QUERY_TARGET_RESPONDED && targets[i].state != QUERY_TARGET_NO_RESPONSE) {
            return false;
        }
    }

    return true;
}

// Polling function, invoked periodically to send queries and
// interpret new responses received from remote servers.
// Returns zero when the query sequence has completed and all targets
// have returned responses or timed out.

int NET_Query_Poll(net_query_callback_t callback, void *user_data)
{
    CheckTargetTimeouts();

    // Send a query.  This will only send a single query at once.

    SendOneQuery();

    // Check for a response

    NET_Query_GetResponse(callback, user_data);

    return !AllTargetsDone();
}

// Stop the query loop

static void NET_Query_ExitLoop(void) { query_loop_running = false; }

// Loop waiting for responses.
// The specified callback is invoked when a new server responds.

static void NET_Query_QueryLoop(net_query_callback_t callback, void *user_data)
{
    query_loop_running = true;

    while (query_loop_running && NET_Query_Poll(callback, user_data)) {
        // Don't thrash the CPU

        I_Sleep(1);
    }
}

void NET_Query_Init(void)
{
    if (query_context == NULL) {
        query_context = NET_NewContext();
        NET_AddModule(query_context, &net_websockets_module);
        net_websockets_module.InitClient();
    }

    free(targets);
    targets = NULL;
    num_targets = 0;

    printed_header = false;
}

// Callback that exits the query loop when the first server is found.

static void NET_Query_ExitCallback(net_addr_t *addr, net_querydata_t *data, unsigned int ping_time, void *user_data)
{
    NET_Query_ExitLoop();
}

// Search the targets list and find a target that has responded.
// If none have responded, returns NULL.

static query_target_t *FindFirstResponder(void)
{
    unsigned int i;

    for (i = 0; i < num_targets; ++i) {
        if (targets[i].type == QUERY_TARGET_SERVER && targets[i].state == QUERY_TARGET_RESPONDED) {
            return &targets[i];
        }
    }

    return NULL;
}

// Return a count of the number of responses.

static int GetNumResponses(void)
{
    unsigned int i;
    int result;

    result = 0;

    for (i = 0; i < num_targets; ++i) {
        if (targets[i].type == QUERY_TARGET_SERVER && targets[i].state == QUERY_TARGET_RESPONDED) {
            ++result;
        }
    }

    return result;
}

int NET_StartLANQuery(void)
{
    query_target_t *target;

    NET_Query_Init();

    // Add a broadcast target to the list.

    target = GetTargetForAddr(NULL, true);
    target->type = QUERY_TARGET_BROADCAST;

    return 1;
}

// -----------------------------------------------------------------------

static void formatted_printf(int wide, const char *s, ...) PRINTF_ATTR(2, 3);
static void formatted_printf(int wide, const char *s, ...)
{
    va_list args;
    int i;

    va_start(args, s);
    i = vprintf(s, args);
    va_end(args);

    while (i < wide) {
        putchar(' ');
        ++i;
    }
}

static const char *GameDescription(GameMode_t mode, GameMission_t mission)
{
    switch (mission) {
    case doom:
        if (mode == shareware)
            return "swdoom";
        else if (mode == registered)
            return "regdoom";
        else if (mode == retail)
            return "ultdoom";
        else
            return "doom";
    case doom2:
        return "doom2";
    case pack_tnt:
        return "tnt";
    case pack_plut:
        return "plutonia";
    case pack_chex:
        return "chex";
    case pack_hacx:
        return "hacx";
    case heretic:
        return "heretic";
    case hexen:
        return "hexen";
    case strife:
        return "strife";
    default:
        return "?";
    }
}

static void PrintHeader(void)
{
    int i;

    putchar('\n');
    formatted_printf(5, "Ping");
    formatted_printf(18, "Address");
    formatted_printf(8, "Players");
    puts("Description");

    for (i = 0; i < 70; ++i)
        putchar('=');
    putchar('\n');
}

// Callback function that just prints information in a table.

static void NET_QueryPrintCallback(net_addr_t *addr, net_querydata_t *data, unsigned int ping_time, void *user_data)
{
    // If this is the first server, print the header.

    if (!printed_header) {
        PrintHeader();
        printed_header = true;
    }

    formatted_printf(5, "%4i", ping_time);
    formatted_printf(22, "%s", NET_AddrToString(addr));
    formatted_printf(4, "%i/%i ", data->num_players, data->max_players);

    if (data->gamemode != indetermined) {
        printf("(%s) ", GameDescription(data->gamemode, data->gamemission));
    }

    if (data->server_state) {
        printf("(game running) ");
    }

    printf("%s\n", data->description);
}

void NET_LANQuery(void)
{
    if (NET_StartLANQuery()) {
        printf("\nSearching for servers on local LAN ...\n");

        NET_Query_QueryLoop(NET_QueryPrintCallback, NULL);

        printf("\n%i server(s) found.\n", GetNumResponses());
        FreeTargets();
    }
}

net_addr_t *NET_FindLANServer(void)
{
    query_target_t *target;
    query_target_t *responder;
    net_addr_t *result;

    NET_Query_Init();

    // Add a broadcast target to the list.

    target = GetTargetForAddr(NULL, true);
    target->type = QUERY_TARGET_BROADCAST;

    // Run the query loop, and stop at the first target found.

    NET_Query_QueryLoop(NET_Query_ExitCallback, NULL);

    responder = FindFirstResponder();

    if (responder != NULL) {
        result = responder->addr;
        NET_ReferenceAddress(result);
    }
    else {
        result = NULL;
    }

    FreeTargets();
    return result;
}

