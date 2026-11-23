import org.cyclonedx.gradle.CyclonedxDirectTask
import org.cyclonedx.gradle.CyclonedxPlugin

initscript {
    repositories {
        gradlePluginPortal()
    }
    dependencies {
        classpath("org.cyclonedx.bom:org.cyclonedx.bom.gradle.plugin:3.6.1")
        // TODO OP-21714 remove once the CycloneDX plugin brings jackson-databind >= 2.22.4 and guava >= 33.7.2
        classpath(platform("com.fasterxml.jackson:jackson-bom:2.22.4"))
        constraints {
            classpath("com.google.guava:guava:33.8.0-jre")
        }
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
