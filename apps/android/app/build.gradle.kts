plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun String.asBuildConfigLiteral(): String =
    "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val relayBaseURL = providers.gradleProperty("STATUSLINE_RELAY_BASE_URL")
    .orElse(providers.environmentVariable("STATUSLINE_RELAY_BASE_URL"))
    .orElse("https://statusline-relay.inmerzion.workers.dev")
    .get()

val releaseKeystorePath = providers.environmentVariable("STATUSLINE_ANDROID_KEYSTORE_FILE").orNull
val releaseKeystorePassword =
    providers.environmentVariable("STATUSLINE_ANDROID_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("STATUSLINE_ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("STATUSLINE_ANDROID_KEY_PASSWORD").orNull
val releaseSigningValues = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
)
val configuredSigningValueCount = releaseSigningValues.count { !it.isNullOrBlank() }
if (configuredSigningValueCount != 0 && configuredSigningValueCount != releaseSigningValues.size) {
    throw GradleException(
        "Android release signing is partially configured. Set all four " +
            "STATUSLINE_ANDROID_* signing variables.",
    )
}
val releaseSigningConfigured = configuredSigningValueCount == releaseSigningValues.size
val allowUnsignedRelease = providers.gradleProperty("STATUSLINE_ALLOW_UNSIGNED_RELEASE")
    .map(String::toBoolean)
    .orElse(false)
    .get()
val releasePackagingRequested = gradle.startParameter.taskNames.any { requestedTask ->
    val taskName = requestedTask.substringAfterLast(':')
    taskName in setOf("bundle", "assemble", "build") ||
        ("Release" in taskName &&
            (taskName.startsWith("bundle") ||
                taskName.startsWith("assemble") ||
                taskName.startsWith("package") ||
                taskName.startsWith("sign")))
}
if (releasePackagingRequested && !releaseSigningConfigured && !allowUnsignedRelease) {
    throw GradleException(
        "Release packaging requires the STATUSLINE_ANDROID_* signing variables. " +
            "Use -PSTATUSLINE_ALLOW_UNSIGNED_RELEASE=true only for local diagnostics.",
    )
}

android {
    namespace = "inmerzion.statusline"
    compileSdk = 37
    compileSdkMinor = 0

    defaultConfig {
        applicationId = "inmerzion.statusline"
        minSdk = 23
        targetSdk = 36
        versionCode = 7
        versionName = "0.1.11"

        buildConfigField("String", "RELAY_BASE_URL", relayBaseURL.asBuildConfigLiteral())
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["usesCleartextTraffic"] = "false"
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                storeFile = file(requireNotNull(releaseKeystorePath))
                storePassword = requireNotNull(releaseKeystorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            if (releaseSigningConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all {
            it.systemProperty(
                "statusline.fixture",
                rootProject.file("../../protocol/fixtures/aes-gcm-v1.json").absolutePath,
            )
        }
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "/META-INF/DEPENDENCIES",
        )
    }
}

dependencies {
    // Compose 1.12 requires compileSdk 37; targetSdk remains independently pinned to 36.
    val composeBOM = platform("androidx.compose:compose-bom:2026.08.00")

    implementation(composeBOM)
    androidTestImplementation(composeBOM)

    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    val cameraXVersion = "1.6.2"
    implementation("androidx.camera:camera-camera2:$cameraXVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraXVersion")
    implementation("androidx.camera:camera-view:$cameraXVersion")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
