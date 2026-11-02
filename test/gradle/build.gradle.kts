plugins {
    java
}

group = "com.openhealthhub"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.slf4j:slf4j-api:2.0.17")
    // EPL-1.0, must not be checked as it is a test dependency
    testImplementation("junit:junit:4.13.2")
}
