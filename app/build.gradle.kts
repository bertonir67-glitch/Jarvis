import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Chaves ficam em local.properties (fora do git) ou em variáveis de ambiente (CI).
// Nunca commite chave de API.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun secret(name: String): String =
    localProps.getProperty(name) ?: System.getenv(name) ?: ""

android {
    namespace = "com.jarvis.assistant"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.jarvis.assistant"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        // Valores padrão embutidos no APK. Também podem ser trocados
        // em tempo de execução na tela de Configurações do app.
        buildConfigField("String", "GEMINI_API_KEY", "\"${secret("GEMINI_API_KEY")}\"")
        buildConfigField("String", "ANTHROPIC_API_KEY", "\"${secret("ANTHROPIC_API_KEY")}\"")
        buildConfigField("String", "ELEVENLABS_API_KEY", "\"${secret("ELEVENLABS_API_KEY")}\"")
        buildConfigField("String", "PICOVOICE_ACCESS_KEY", "\"${secret("PICOVOICE_ACCESS_KEY")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Assinado com a chave de debug para permitir instalação direta do APK de CI.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.service)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.porcupine)

    debugImplementation(libs.androidx.ui.tooling)
}
