#!/bin/sh
. ~/.bashrc

export PATH="$PATH:~/.local/bin:/usr/local/go/bin"
export OC_SSH='user123.'
export SSHPASS='user123.'
cd ~ ; openchamber --port $PORT