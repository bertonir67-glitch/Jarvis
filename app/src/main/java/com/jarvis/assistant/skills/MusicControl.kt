package com.jarvis.assistant.skills

import android.app.SearchManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.provider.MediaStore
import android.view.KeyEvent

/**
 * Controle de música.
 *
 * Play/pause/próxima usam eventos de tecla de mídia, que qualquer player em foreground
 * respeita — funciona no Spotify, YouTube Music, Deezer, podcast, sem integração específica
 * com nenhum deles. Só o "toca tal coisa" precisa escolher um app.
 */
class MusicControl(private val context: Context) {

    private val audio get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    fun playPause(): String {
        send(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
        return "Feito."
    }

    fun next(): String {
        send(KeyEvent.KEYCODE_MEDIA_NEXT)
        return "Próxima faixa."
    }

    fun previous(): String {
        send(KeyEvent.KEYCODE_MEDIA_PREVIOUS)
        return "Faixa anterior."
    }

    fun stop(): String {
        send(KeyEvent.KEYCODE_MEDIA_STOP)
        return "Música parada."
    }

    fun play(query: String?, app: String?): String {
        if (query.isNullOrBlank()) {
            send(KeyEvent.KEYCODE_MEDIA_PLAY)
            return "Retomando."
        }

        val intent = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
            .putExtra(SearchManager.QUERY, query)
            .putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        packageFor(app)?.let { intent.setPackage(it) }

        // Se o app pedido não atender essa intent, tenta de novo sem forçar o pacote.
        return runCatching {
            context.startActivity(intent)
            "Tocando $query."
        }.recoverCatching {
            context.startActivity(intent.setPackage(null))
            "Tocando $query."
        }.getOrElse {
            "Nenhum app de música aceitou tocar \"$query\"."
        }
    }

    private fun packageFor(app: String?): String? = when (app?.lowercase()) {
        "spotify" -> "com.spotify.music"
        "youtube_music" -> "com.google.android.apps.youtube.music"
        else -> null
    }

    /**
     * Uma tecla de mídia precisa do par pressionar/soltar — só o ACTION_DOWN é ignorado
     * pela maioria dos players.
     */
    private fun send(keyCode: Int) {
        val manager = audio
        manager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        manager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
    }
}
