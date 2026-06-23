#!/bin/bash
# Usage: ./docker-backup.sh <image_name:tag> <volume_name> <bundle_name.tar>

IMAGE=postgres:16-alpine
VOLUME=postgres_data
BUNDLE=backup.tar

echo "Saving Docker image: $IMAGE"
docker save $IMAGE | gzip > image.tar.gz

echo "Saving Docker volume: $VOLUME"
docker run --rm -v $VOLUME:/volume -v $(pwd):/backup busybox tar czf /backup/volume.tar.gz /volume

echo "Bundling image and volume into $BUNDLE"
tar czf $BUNDLE image.tar.gz volume.tar.gz

echo "Backup complete: $BUNDLE"