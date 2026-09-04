-keepattributes *Annotation*
-dontwarn org.intellij.lang.annotations.**

# Firebase discovers ML Kit registrars by class name and invokes their empty
# constructors reflectively. R8 full mode keeps the registrar class names via
# firebase-components' consumer rules, but can still remove the constructors.
-keep class * implements com.google.firebase.components.ComponentRegistrar {
    public <init>();
}
