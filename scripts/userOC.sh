#!/bin/sh

cd ~
. ~/.bashrc

export PATH="$PATH:~/.local/bin:/usr/local/go/bin"
export OC_SSH='user123.'
export SSHPASS='user123.'

echo $$ > /tmp/mc/${USER}_OC.pid

openchamber --port $PORT --host 127.0.0.1