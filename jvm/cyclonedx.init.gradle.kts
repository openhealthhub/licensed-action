import org.cyclonedx.gradle.CyclonedxDirectTask
import org.cyclonedx.gradle.CyclonedxPlugin

initscript {
    repositories {
        gradlePluginPortal()
    }
    dependencies {
        classpath("org.cyclonedx.bom:org.cyclonedx.bom.gradle.plugin:3.6.1")
    }
}

rootProject {
    apply<CyclonedxPlugin>()
    allprojects {
        tasks.withType<CyclonedxDirectTask>().configureEach {
            includeConfigs = listOf("runtimeClasspath")
        }
    }
}
