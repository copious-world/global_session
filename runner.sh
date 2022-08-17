#!/bin/sh

while true; do
    [ -e /home/dietpi/stopme ] && break
    global-sessions $1
done


# nohup ./runner.sh > /home/dietpi/runner.log &

