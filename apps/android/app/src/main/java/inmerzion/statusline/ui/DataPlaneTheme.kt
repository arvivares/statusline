package inmerzion.statusline.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object DataPlaneColors {
    val Canvas = Color(0xFF0D0E0B)
    val Surface = Color(0xFF14150F)
    val Ink = Color(0xFFECE9DC)
    val Muted = Color(0xFF9D9B89)
    val Line = Color(0xFF3B3929)
    val Grid = Color(0x0CEFC65A)
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
        fontFamily = FontFamily.Monospace,
        fontSize = 12.sp,
        lineHeight = 17.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        letterSpacing = 0.8.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        fontSize = 10.sp,
        letterSpacing = 1.1.sp,
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

@Composable
fun DataPlaneGrid(modifier: Modifier = Modifier) {
    val spacing = 24.dp
    Canvas(modifier = modifier.fillMaxSize()) {
        val step = spacing.toPx()
        var x = 0f
        while (x <= size.width) {
            drawLine(
                color = DataPlaneColors.Grid,
                start = Offset(x, 0f),
                end = Offset(x, size.height),
                strokeWidth = 0.5.dp.toPx(),
            )
            x += step
        }
        var y = 0f
        while (y <= size.height) {
            drawLine(
                color = DataPlaneColors.Grid,
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 0.5.dp.toPx(),
            )
            y += step
        }
    }
}
