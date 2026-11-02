#!/usr/bin/env bash
# Writes a CycloneDX SBOM of the runtime dependencies and prints its path.
set -euo pipefail

case "$BUILD_TOOL" in
  maven)
    mvn -B -q -DskipTests org.cyclonedx:cyclonedx-maven-plugin:2.9.3:makeAggregateBom \
      -DoutputFormat=json -DincludeProvidedScope=false -Dcyclonedx.skipNotDeployed=false >&2
    echo "target/bom.json"
    ;;
  gradle)
    bash ./gradlew -q cyclonedxBom --init-script "$(dirname "$0")/cyclonedx.init.gradle.kts" >&2
    echo "build/reports/cyclonedx/bom.json"
    ;;
  *)
    echo "Unsupported build tool: $BUILD_TOOL" >&2
    exit 1
    ;;
esac
