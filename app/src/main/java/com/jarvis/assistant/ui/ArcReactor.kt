package com.jarvis.assistant.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import com.jarvis.assistant.core.Phase
import com.jarvis.assistant.ui.theme.JarvisColors
import kotlin.math.min

/**
 * O reator arc. Não é decoração: cada estado do assistente tem uma assinatura visual
 * distinta, então dá para saber se ele está ouvindo, pensando ou falando sem ler nada.
 */
@Composable
fun ArcReactor(
    phase: Phase,
    amplitude: Float,
    modifier: Modifier = Modifier
) {
    val transition = rememberInfiniteTransition(label = "reactor")

    // Rotação contínua do anel externo — mais rápida enquanto processa.
    val spin by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (phase == Phase.THINKING) 1600 else 9000),
            repeatMode = RepeatMode.Restart
        ),
        label = "spin"
    )

    // Respiração do núcleo em espera.
    val breathe by transition.animateFloat(
        initialValue = 0.82f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2200),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breathe"
    )

    val glow by animateFloatAsState(
        targetValue = when (phase) {
            Phase.OFF -> 0.12f
            Phase.STANDBY -> 0.45f
            Phase.LISTENING -> 0.55f + amplitude * 0.45f
            Phase.THINKING -> 0.85f
            Phase.SPEAKING -> 0.95f
        },
        animationSpec = tween(220),
        label = "glow"
    )

    val accent = when (phase) {
        Phase.OFF -> JarvisColors.CyanDim
        Phase.SPEAKING -> JarvisColors.CyanSoft
        else -> JarvisColors.Cyan
    }

    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val radius = min(size.width, size.height) / 2f
        val core = radius * 0.30f * (if (phase == Phase.STANDBY) breathe else 1f)

        // Halo
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(accent.copy(alpha = 0.34f * glow), Color.Transparent),
                center = center,
                radius = radius
            ),
            radius = radius,
            center = center
        )

        // Anel externo segmentado, girando
        val segments = 24
        val segSweep = 360f / segments * 0.55f
        val outerR = radius * 0.92f
        repeat(segments) { i ->
            val start = spin + i * (360f / segments)
            drawArc(
                color = accent.copy(alpha = 0.20f + 0.55f * glow * (if (i % 3 == 0) 1f else 0.4f)),
                startAngle = start,
                sweepAngle = segSweep,
                useCenter = false,
                topLeft = Offset(center.x - outerR, center.y - outerR),
                size = Size(outerR * 2, outerR * 2),
                style = Stroke(width = radius * 0.035f)
            )
        }

        // Anel intermediário fixo
        drawCircle(
            color = accent.copy(alpha = 0.30f + 0.4f * glow),
            radius = radius * 0.66f,
            center = center,
            style = Stroke(width = radius * 0.012f)
        )

        // Arco de progresso: só aparece enquanto ele pensa
        if (phase == Phase.THINKING) {
            val r = radius * 0.78f
            drawArc(
                color = JarvisColors.CyanSoft,
                startAngle = -spin * 2f,
                sweepAngle = 90f,
                useCenter = false,
                topLeft = Offset(center.x - r, center.y - r),
                size = Size(r * 2, r * 2),
                style = Stroke(width = radius * 0.02f)
            )
        }

        // Barras de nível durante a escuta
        if (phase == Phase.LISTENING) {
            val bars = 40
            repeat(bars) { i ->
                val angle = Math.toRadians((i * 360.0 / bars) - 90.0)
                val wave = (0.35f + amplitude) * (0.6f + 0.4f * kotlin.math.sin(i * 1.7f))
                val inner = radius * 0.70f
                val outer = inner + radius * 0.18f * wave.coerceIn(0.05f, 1f)
                drawLine(
                    color = accent.copy(alpha = 0.35f + 0.5f * amplitude),
                    start = Offset(
                        center.x + (inner * kotlin.math.cos(angle)).toFloat(),
                        center.y + (inner * kotlin.math.sin(angle)).toFloat()
                    ),
                    end = Offset(
                        center.x + (outer * kotlin.math.cos(angle)).toFloat(),
                        center.y + (outer * kotlin.math.sin(angle)).toFloat()
                    ),
                    strokeWidth = radius * 0.012f
                )
            }
        }

        // Triângulo do núcleo
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color.White.copy(alpha = 0.9f * glow),
                    accent.copy(alpha = 0.85f * glow),
                    Color.Transparent
                ),
                center = center,
                radius = core * 1.8f
            ),
            radius = core * 1.8f,
            center = center
        )
        drawCircle(
            color = accent.copy(alpha = 0.55f + 0.45f * glow),
            radius = core,
            center = center,
            style = Stroke(width = radius * 0.018f)
        )
    }
}
