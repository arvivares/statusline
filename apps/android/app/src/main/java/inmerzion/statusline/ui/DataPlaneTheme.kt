package inmerzion.statusline.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object DataPlaneColors {
    val Canvas = Color(0xFF181813)
    val Surface = Color(0xFF181813)
    val Ink = Color(0xFFF2F0EB)
    val Muted = Color(0xFFA09E97)
    val Line = Color(0xFF3E3E37)
    val Track = Color(0xFF2F2F29)
    val Signal = Color(0xFFEFC65A)
    val Critical = Color(0xFFF26856)

    fun emphasis(remainingPercentage: Int): Color =
        if (remainingPercentage <= 20) Critical else Signal
}

private val dataPlaneScheme = darkColorScheme(
    primary = DataPlaneColors.Signal,
    onPrimary = DataPlaneColors.Canvas,
    secondary = DataPlaneColors.Ink,
    onSecondary = DataPlaneColors.Canvas,
    background = DataPlaneColors.Canvas,
    onBackground = DataPlaneColors.Ink,
    surface = DataPlaneColors.Surface,
    onSurface = DataPlaneColors.Ink,
    error = DataPlaneColors.Critical,
    onError = DataPlaneColors.Canvas,
    outline = DataPlaneColors.Line,
)

private val dataPlaneTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 72.sp,
        lineHeight = 72.sp,
        letterSpacing = (-3).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 36.sp,
        lineHeight = 40.sp,
        letterSpacing = (-1).sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 16.sp,
        lineHeight = 23.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontSize = 12.sp,
        lineHeight = 17.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        letterSpacing = 0.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 10.sp,
        letterSpacing = 0.sp,
    ),
)

@Composable
fun StatuslineTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = dataPlaneScheme,
        typography = dataPlaneTypography,
        content = content,
    )
}
