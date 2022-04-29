#!/bin/bash

cd "`dirname \"$0\"`/.."

emmake make clean
emconfigure autoreconf -fiv
EMCONFIGURE_JS=1 ac_cv_exeext=".html" emconfigure ./configure --host=none-none-none

emmake make
