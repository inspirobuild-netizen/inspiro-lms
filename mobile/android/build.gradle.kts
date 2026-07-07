allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

// Plugins disagree on compileSdk: agora_rtc_engine pins 31 (too low for its
// AndroidX deps), while sqflite_android 2.4.x needs 36 (API-36 symbols). Force
// every Android subproject to 36 — the highest any plugin requires. Registered
// BEFORE the evaluationDependsOn block below so the afterEvaluate hook attaches
// before the subproject is force-evaluated. Reflection on setCompileSdk keeps
// this working regardless of AGP DSL type (BaseExtension vs CommonExtension).
subprojects {
    afterEvaluate {
        val android = project.extensions.findByName("android") ?: return@afterEvaluate
        val setter = android.javaClass.methods.firstOrNull {
            it.name == "setCompileSdk" && it.parameterTypes.size == 1
        }
        setter?.invoke(android, 36)
    }
}

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
