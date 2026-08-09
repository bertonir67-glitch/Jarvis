package com.jarvis.assistant.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.jarvis.assistant.core.JarvisState
import com.jarvis.assistant.core.Phase
import com.jarvis.assistant.core.Turn
import com.jarvis.assistant.ui.theme.JarvisColors
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun JarvisScreen(
    onStart: () -> Unit,
    onStop: () -> Unit,
    onTalk: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val phase by JarvisState.phase.collectAsStateWithLifecycle()
    val amplitude by JarvisState.amplitude.collectAsStateWithLifecycle()
    val transcript by JarvisState.transcript.collectAsStateWithLifecycle()
    val error by JarvisState.lastError.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(JarvisColors.Void)
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(12.dp))

        Text(
            text = "J A R V I S",
            style = MaterialTheme.typography.titleLarge,
            color = JarvisColors.Cyan
        )

        Spacer(Modifier.height(28.dp))

        ArcReactor(
            phase = phase,
            amplitude = amplitude,
            modifier = Modifier.size(230.dp)
        )

        Spacer(Modifier.height(20.dp))

        Text(
            text = phase.label(),
            style = MaterialTheme.typography.labelLarge,
            color = if (phase == Phase.OFF) JarvisColors.TextMuted else JarvisColors.CyanSoft
        )

        if (error != null) {
            Spacer(Modifier.height(10.dp))
            Text(
                text = error!!,
                style = MaterialTheme.typography.bodyMedium,
                color = JarvisColors.Danger,
                textAlign = TextAlign.Center
            )
        }

        Spacer(Modifier.height(20.dp))

        Transcript(
            turns = transcript,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        )

        Spacer(Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (phase == Phase.OFF) {
                Button(
                    onClick = onStart,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = JarvisColors.Cyan,
                        contentColor = JarvisColors.Void
                    )
                ) { Text("ATIVAR") }
            } else {
                Button(
                    onClick = onTalk,
                    modifier = Modifier.weight(1f),
                    enabled = phase == Phase.STANDBY,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = JarvisColors.Cyan,
                        contentColor = JarvisColors.Void
                    )
                ) { Text("FALAR") }

                OutlinedButton(
                    onClick = onStop,
                    modifier = Modifier.width(120.dp)
                ) { Text("PARAR") }
            }
        }

        TextButton(onClick = onOpenSettings) {
            Text("Configurações", color = JarvisColors.TextMuted)
        }
    }
}

@Composable
private fun Transcript(turns: List<Turn>, modifier: Modifier = Modifier) {
    val listState = rememberLazyListState()

    LaunchedEffect(turns.size) {
        if (turns.isNotEmpty()) listState.animateScrollToItem(turns.lastIndex)
    }

    if (turns.isEmpty()) {
        Box(modifier, contentAlignment = Alignment.Center) {
            Text(
                text = "Diga \"Jarvis\" para começar.",
                style = MaterialTheme.typography.bodyMedium,
                color = JarvisColors.TextMuted
            )
        }
        return
    }

    LazyColumn(
        modifier = modifier,
        state = listState,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(turns) { turn ->
            Row(modifier = Modifier.fillMaxWidth()) {
                Box(
                    Modifier
                        .width(3.dp)
                        .height(if (turn.text.length > 60) 44.dp else 22.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(
                            if (turn.fromUser) JarvisColors.CyanDim else JarvisColors.Cyan
                        )
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = turn.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (turn.fromUser) JarvisColors.TextMuted else JarvisColors.TextPrimary
                )
            }
        }
    }
}

private fun Phase.label(): String = when (this) {
    Phase.OFF -> "DESLIGADO"
    Phase.STANDBY -> "EM ESPERA"
    Phase.LISTENING -> "OUVINDO"
    Phase.THINKING -> "PROCESSANDO"
    Phase.SPEAKING -> "RESPONDENDO"
}
