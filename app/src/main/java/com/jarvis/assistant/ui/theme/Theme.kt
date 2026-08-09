package com.jarvis.assistant.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Paleta do HUD: azul-noite quase preto, com o ciano do reator como única cor viva. */
object JarvisColors {
    val Void = Color(0xFF04070D)
    val Panel = Color(0xFF0A121C)
    val Cyan = Color(0xFF4DE2FF)
    val CyanSoft = Color(0xFF7FF0FF)
    val CyanDim = Color(0xFF1E6B80)
    val Amber = Color(0xFFFFB454)
    val Danger = Color(0xFFFF6B6B)
    val TextPrimary = Color(0xFFDCEEF5)
    val TextMuted = Color(0xFF7C93A3)
}

private val Scheme = darkColorScheme(
    primary = JarvisColors.Cyan,
    onPrimary = JarvisColors.Void,
    secondary = JarvisColors.CyanDim,
    background = JarvisColors.Void,
    onBackground = JarvisColors.TextPrimary,
    surface = JarvisColors.Panel,
    onSurface = JarvisColors.TextPrimary,
    error = JarvisColors.Danger
)

/** Monoespaçada: o HUD tem que parecer instrumentação, não um app de mensagens. */
private val JarvisTypography = Typography(
    bodyLarge = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 15.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 13.sp),
    labelLarge = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 2.sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = 22.sp,
        fontWeight = FontWeight.Light,
        letterSpacing = 8.sp
    )
)

/** O HUD é sempre escuro, por desenho — não segue o tema do sistema. */
@Composable
fun JarvisTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = Scheme,
        typography = JarvisTypography,
        content = content
    )
}
