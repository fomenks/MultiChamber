#!/bin/sh

cd ~
. ~/.bashrc

if [ -f .env ] ; then
 source .env
fi

if [ ! -d workspace ] ; then 
  mkdir workspace
fi

export PATH="$PATH:~/.local/bin:/usr/local/go/bin"
export OC_SSH='user123.'
export SSHPASS='user123.'

echo $$ > /tmp/mc/${USER}_OC.pid

openchamber --port $PORT