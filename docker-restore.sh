#!/bin/bash
# Usage: ./docker-restore.sh <bundle_name.tar> <volume_name>

BUNDLE=backup.tar
VOLUME=postgres_data

echo "Extracting bundle: $BUNDLE"
tar xzf $BUNDLE

echo "Loading Docker image"
gunzip -c image.tar.gz | docker load

echo "Restoring Docker volume: $VOLUME"
docker volume create $VOLUME
docker run --rm -v $VOLUME:/volume -v $(pwd):/backup busybox tar xzf /backup/volume.tar.gz -C /

echo "Restore complete. You can now run your container."
