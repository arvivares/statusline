package inmerzion.statusline.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.annotation.RequiresApi
import inmerzion.statusline.MainActivity
import inmerzion.statusline.R
import inmerzion.statusline.data.StatuslineRepository
import inmerzion.statusline.localization.L10n
import inmerzion.statusline.protocol.AgentProviderId
import inmerzion.statusline.protocol.AgentProviderReading
import inmerzion.statusline.protocol.AgentQuotaWindow
import inmerzion.statusline.protocol.AgentServicesSnapshot
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import kotlin.math.ceil

internal enum class WidgetLayoutSize {
    COMPACT,
    SMALL,
    MEDIUM,
}

internal object WidgetLayoutPolicy {
    const val DEFAULT_WIDTH_DP = 276f
    const val DEFAULT_HEIGHT_DP = 50f
    const val MEDIUM_MIN_WIDTH_DP = 270f
    const val TALL_MIN_HEIGHT_DP = 110f
    const val MAX_RESPONSIVE_SIZES = 16
    const val MAX_METER_WIDTH_DP = 1_024f
    const val MAX_METER_WIDTH_PX = 1_024
    const val MAX_METER_HEIGHT_PX = 12

    fun layoutSize(widthDp: Float, heightDp: Float): WidgetLayoutSize = when {
        !validSize(widthDp, heightDp) || heightDp < TALL_MIN_HEIGHT_DP -> WidgetLayoutSize.COMPACT
        widthDp >= MEDIUM_MIN_WIDTH_DP -> WidgetLayoutSize.MEDIUM
        else -> WidgetLayoutSize.SMALL
    }

    fun validSize(widthDp: Float, heightDp: Float): Boolean =
        widthDp.isFinite() && heightDp.isFinite() && widthDp > 0 && heightDp > 0

    fun numberSizeSp(size: WidgetLayoutSize, widthDp: Float, heightDp: Float, hasWatchlist: Boolean): Float =
        when (size) {
            WidgetLayoutSize.COMPACT -> 30f
            WidgetLayoutSize.SMALL -> minOf(46f, heightDp - 86f, (widthDp - 50f) / 1.8f).coerceAtLeast(18f)
            WidgetLayoutSize.MEDIUM -> if (hasWatchlist) {
                minOf(46f, heightDp - 82f).coerceAtLeast(28f)
            } else {
                minOf(54f, heightDp - 56f).coerceAtLeast(28f)
            }
        }

    fun meterWidthDp(widthDp: Float): Float =
        if (widthDp.isFinite()) widthDp.coerceIn(1f, MAX_METER_WIDTH_DP) else 1f

    fun meterPixels(dp: Float, density: Float, maximum: Int): Int {
        val safeDensity = if (density.isFinite() && density > 0) density else 1f
        return (dp * safeDensity).toInt().coerceIn(1, maximum)
    }

    fun terminalStripe(remainingPercentage: Int, widthDp: Float, stepDp: Float = 6f): Int {
        if (!widthDp.isFinite() || !stepDp.isFinite()) return -1
        val edge = widthDp * remainingPercentage.coerceIn(0, 100) / 100f
        return if (edge > 0 && stepDp > 0) (ceil(edge / stepDp).toInt() - 1).coerceAtLeast(0) else -1
    }
}

internal data class WidgetProviderPresentation(
    val id: AgentProviderId,
    val window: AgentQuotaWindow?,
    val updatedAtEpochSeconds: Long,
    val isReady: Boolean,
) {
    val remainingPercentage: Int? get() = window?.remainingPercentage?.coerceIn(0, 100)
    val number: String get() = remainingPercentage?.toString() ?: "—"
    val heading: String get() = id.displayName + " · " + WidgetPresentationPolicy.windowLabel(window)
}

internal data class WidgetPresentation(
    val focused: WidgetProviderPresentation?,
    val watchlist: List<WidgetProviderPresentation>,
    val isDemo: Boolean,
)

/** A cache-only projection: an empty inventory is authoritative, including after legacy migration. */
internal object WidgetPresentationPolicy {
    fun present(
        snapshot: AgentServicesSnapshot?,
        preferred: AgentProviderId?,
        size: WidgetLayoutSize,
    ): WidgetPresentation {
        val focused = snapshot?.focusedProvider(preferred)
        return WidgetPresentation(
            focused = focused?.let(::provider),
            watchlist = if (size == WidgetLayoutSize.MEDIUM && focused != null) {
                snapshot.providers.filter { it.id != focused.id }.distinctBy { it.id }.map(::provider)
            } else emptyList(),
            isDemo = snapshot?.isDemo == true,
        )
    }

    private fun provider(reading: AgentProviderReading): WidgetProviderPresentation = WidgetProviderPresentation(
        id = reading.id,
        // Match iOS defaults: Codex weekly; Gemini short window. Never relabel a fallback window.
        window = if (reading.status == "ready") {
            if (reading.id == AgentProviderId.ANTIGRAVITY) reading.shortWindow ?: reading.weekly
            else reading.primaryWindow
        } else null,
        updatedAtEpochSeconds = reading.updatedAtEpochSeconds,
        isReady = reading.status == "ready",
    )

    fun windowLabel(window: AgentQuotaWindow?): String = when {
        window == null -> L10n.text("Unavailable")
        window.windowMinutes >= 8_640 -> L10n.text("Weekly")
        window.windowMinutes % 60 == 0 -> L10n.text("{0}h", window.windowMinutes / 60)
        else -> L10n.text("{0} min", window.windowMinutes)
    }

    fun age(updatedAtEpochSeconds: Long, nowEpochSeconds: Long): String {
        val elapsed = (nowEpochSeconds - updatedAtEpochSeconds).coerceAtLeast(0)
        return when {
            elapsed < 60 -> L10n.text("NOW")
            elapsed < 3_600 -> L10n.text("{0} MIN AGO", elapsed / 60)
            elapsed < 86_400 -> L10n.text("{0} H AGO", elapsed / 3_600)
            else -> L10n.text("{0} D AGO", elapsed / 86_400)
        }
    }
}

private data class WidgetSource(
    val snapshot: AgentServicesSnapshot?,
    val preferred: AgentProviderId?,
    val nowEpochSeconds: Long = System.currentTimeMillis() / 1_000,
)

class StatuslineWidgetProvider : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == Intent.ACTION_LOCALE_CHANGED) updateAll(context)
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        val source = loadSource(context)
        appWidgetIds.forEach { widgetId ->
            updateWidget(context, appWidgetManager, widgetId, source)
        }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle,
    ) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        updateWidget(
            context = context,
            manager = appWidgetManager,
            widgetId = appWidgetId,
            source = loadSource(context),
            options = newOptions,
        )
    }

    companion object {
        private fun loadSource(context: Context): WidgetSource = runCatching {
            val repository = StatuslineRepository(context)
            WidgetSource(repository.cachedServices(), repository.focusedProviderId())
        }.getOrElse { WidgetSource(null, null) } // Protected storage may be locked before first unlock.

        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, StatuslineWidgetProvider::class.java)
            val source = loadSource(context)
            manager.getAppWidgetIds(component).forEach { widgetId ->
                updateWidget(context, manager, widgetId, source)
            }
        }

        private fun updateWidget(
            context: Context,
            manager: AppWidgetManager,
            widgetId: Int,
            source: WidgetSource,
            options: Bundle = manager.getAppWidgetOptions(widgetId),
        ) {
            manager.updateAppWidget(
                widgetId,
                responsiveViews(context, source, options),
            )
        }

        private fun responsiveViews(
            context: Context,
            source: WidgetSource,
            options: Bundle,
        ): RemoteViews {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val sizes = widgetSizes(options)
                if (!sizes.isNullOrEmpty()) {
                    val mappings = LinkedHashMap<SizeF, RemoteViews>()
                    sizes.asSequence().filter { WidgetLayoutPolicy.validSize(it.width, it.height) }
                        .distinct().take(WidgetLayoutPolicy.MAX_RESPONSIVE_SIZES).forEach { size ->
                        mappings[size] = sizedViews(
                            context = context,
                            source = source,
                            widthDp = size.width,
                            heightDp = size.height,
                        )
                    }
                    if (mappings.isNotEmpty()) return RemoteViews(mappings)
                }
            }

            val minimumWidth = options.getInt(
                AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,
                WidgetLayoutPolicy.DEFAULT_WIDTH_DP.toInt(),
            )
            val minimumHeight = options.getInt(
                AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,
                WidgetLayoutPolicy.DEFAULT_HEIGHT_DP.toInt(),
            )
            return sizedViews(
                context = context,
                source = source,
                widthDp = minimumWidth.toFloat(),
                heightDp = minimumHeight.toFloat(),
            )
        }

        @RequiresApi(Build.VERSION_CODES.S)
        @Suppress("DEPRECATION")
        private fun widgetSizes(options: Bundle): ArrayList<SizeF>? =
            options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES)

        private fun sizedViews(
            context: Context,
            source: WidgetSource,
            widthDp: Float,
            heightDp: Float,
        ): RemoteViews {
            val validSize = WidgetLayoutPolicy.validSize(widthDp, heightDp)
            val width = if (validSize) widthDp else WidgetLayoutPolicy.DEFAULT_WIDTH_DP
            val height = if (validSize) heightDp else WidgetLayoutPolicy.DEFAULT_HEIGHT_DP
            val size = WidgetLayoutPolicy.layoutSize(width, height)
            val presentation = WidgetPresentationPolicy.present(source.snapshot, source.preferred, size)
            val layout = when (size) {
                WidgetLayoutSize.COMPACT -> R.layout.statusline_widget_compact
                WidgetLayoutSize.SMALL -> R.layout.statusline_widget_small
                WidgetLayoutSize.MEDIUM -> R.layout.statusline_widget
            }
            return RemoteViews(context.packageName, layout).also { views ->
                bindLaunchAction(context, views)
                bindStatus(context, views, presentation, source.nowEpochSeconds, width - 24f, size)
                // SP preserves the user's system font scaling; do not cancel it with density math.
                views.setTextViewTextSize(R.id.widgetQuotaNumber, TypedValue.COMPLEX_UNIT_SP,
                    WidgetLayoutPolicy.numberSizeSp(size, width, height, presentation.watchlist.isNotEmpty()))
            }
        }

        private fun bindLaunchAction(context: Context, views: RemoteViews) {
            val launchIntent = Intent(context, MainActivity::class.java)
            val launchPendingIntent = PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widgetRoot, launchPendingIntent)
        }

        private fun bindStatus(
            context: Context,
            views: RemoteViews,
            presentation: WidgetPresentation,
            nowEpochSeconds: Long,
            meterWidthDp: Float,
            size: WidgetLayoutSize,
        ) {
            val provider = presentation.focused
            val small = size == WidgetLayoutSize.SMALL
            // Set even the XML labels explicitly: an unsupported primary language
            // must not select secondary Spanish from Android's resource fallback.
            views.setTextViewText(R.id.widget_no_data_label, L10n.text("NO DATA"))
            views.setTextViewText(R.id.widget_connect_companion, L10n.text("CONNECT COMPANION"))
            if (size != WidgetLayoutSize.COMPACT) {
                views.setTextViewText(R.id.widget_weekly_limit_label_empty, L10n.text("Statusline"))
            }
            if (size == WidgetLayoutSize.MEDIUM) {
                views.setTextViewText(R.id.widget_resets_label, L10n.text("Resets"))
            }
            views.setInt(R.id.widgetRoot, "setLayoutDirection", View.LAYOUT_DIRECTION_LTR)
            views.setViewVisibility(
                R.id.widgetPopulated,
                if (provider != null) View.VISIBLE else View.GONE,
            )
            views.setViewVisibility(
                R.id.widgetEmpty,
                if (provider != null) View.GONE else View.VISIBLE,
            )

            if (provider == null) {
                views.setImageViewBitmap(R.id.widgetEmptyMeter, meterBitmap(context, 0, meterWidthDp, small))
                views.setContentDescription(
                    R.id.widgetRoot,
                    L10n.text("No services to show. Open Statusline Companion on your computer."),
                )
                return
            }

            views.setTextViewText(R.id.widget_weekly_limit_label, provider.heading)
            views.setTextViewText(R.id.widgetQuotaNumber, provider.number)
            val age = WidgetPresentationPolicy.age(provider.updatedAtEpochSeconds, nowEpochSeconds)
            views.setTextViewText(R.id.widgetState, if (presentation.isDemo) L10n.text("DEMO") else age)
            val quotaVisibility = if (provider.window != null) View.VISIBLE else View.GONE
            listOf(R.id.widgetQuotaPercent, R.id.widget_resets_label, R.id.widgetResetTime, R.id.widgetResetDate)
                .forEach { views.setViewVisibility(it, quotaVisibility) }
            views.setTextColor(R.id.widgetQuotaPercent, context.getColor(R.color.data_plane_muted))
            views.setImageViewBitmap(R.id.widgetMeter,
                meterBitmap(context, provider.remainingPercentage ?: 0, meterWidthDp, small))
            provider.window?.let { window ->
                views.setTextViewText(R.id.widgetResetTime, formatReset(window.resetAtEpochSeconds, "HH:mm"))
                views.setTextViewText(R.id.widgetResetDate, formatReset(window.resetAtEpochSeconds, "dd MMM"))
            }
            if (size == WidgetLayoutSize.MEDIUM) bindWatchlist(views, presentation, nowEpochSeconds)
            val description = buildList {
                add(providerDescription(provider, nowEpochSeconds))
                if (presentation.watchlist.isNotEmpty()) {
                    add(L10n.text("Other limits"))
                    addAll(presentation.watchlist.map { providerDescription(it, nowEpochSeconds) })
                }
            }.joinToString(". ")
            views.setContentDescription(R.id.widgetRoot, if (presentation.isDemo) {
                L10n.text("Demo sample. {0}", description)
            } else description)
        }

        private fun bindWatchlist(views: RemoteViews, presentation: WidgetPresentation, nowEpochSeconds: Long) {
            views.removeAllViews(R.id.widgetWatchlist)
            views.setViewVisibility(R.id.widgetWatchlist, if (presentation.watchlist.isEmpty()) View.GONE else View.VISIBLE)
            presentation.watchlist.forEach { provider ->
                val row = RemoteViews(views.`package`, R.layout.statusline_widget_watchlist_row)
                row.setTextViewText(R.id.widgetWatchlistProvider, provider.heading)
                row.setTextViewText(R.id.widgetWatchlistNumber, provider.remainingPercentage?.toString().orEmpty())
                row.setViewVisibility(R.id.widgetWatchlistPercent, if (provider.window == null) View.GONE else View.VISIBLE)
                row.setTextViewText(R.id.widgetWatchlistAge, if (presentation.isDemo) L10n.text("DEMO")
                    else WidgetPresentationPolicy.age(provider.updatedAtEpochSeconds, nowEpochSeconds))
                views.addView(R.id.widgetWatchlist, row)
            }
        }

        private fun providerDescription(provider: WidgetProviderPresentation, nowEpochSeconds: Long): String {
            val quota = provider.window?.let {
                L10n.text("{0} percent remaining. Resets {1}", requireNotNull(provider.remainingPercentage),
                    formatAccessibleReset(it.resetAtEpochSeconds))
            } ?: L10n.text("Unavailable")
            val age = WidgetPresentationPolicy.age(provider.updatedAtEpochSeconds, nowEpochSeconds)
            val sample = if (provider.isReady) L10n.text("Last sample: {0}", age) else L10n.text("Last attempt: {0}", age)
            return provider.heading + ". " + quota + ". " + sample
        }

        private fun meterBitmap(context: Context, remainingPercentage: Int, widthDp: Float, small: Boolean): Bitmap {
            val density = context.resources.displayMetrics.density
            val width = WidgetLayoutPolicy.meterWidthDp(widthDp)
            val heightDp = if (small) 5f else 6f
            // Each responsive size uses at most 48 KiB, even for oversized launcher options.
            val bitmap = Bitmap.createBitmap(
                WidgetLayoutPolicy.meterPixels(width, density, WidgetLayoutPolicy.MAX_METER_WIDTH_PX),
                WidgetLayoutPolicy.meterPixels(heightDp, density, WidgetLayoutPolicy.MAX_METER_HEIGHT_PX),
                Bitmap.Config.ARGB_8888,
            )
            val canvas = Canvas(bitmap)
            canvas.scale(bitmap.width / width, bitmap.height / heightDp)
            val stripe = if (small) 2f else 4f
            val step = stripe * 1.5f
            val terminal = WidgetLayoutPolicy.terminalStripe(remainingPercentage, width, step)
            val paint = Paint().apply { isAntiAlias = false; style = Paint.Style.FILL }
            var x = 0f
            var index = 0
            while (x < width) {
                paint.color = when {
                    index == terminal -> android.graphics.Color.WHITE
                    index < terminal -> context.getColor(R.color.data_plane_signal)
                    else -> context.getColor(R.color.data_plane_track)
                }
                canvas.drawRect(x, 0f, (x + stripe).coerceAtMost(width), heightDp, paint)
                x += step
                index += 1
            }
            return bitmap
        }

        private fun formatReset(epochSeconds: Long, pattern: String): String =
            SimpleDateFormat(pattern, L10n.locale)
                .format(Date(epochSeconds * 1_000))
                .uppercase(L10n.locale)

        private fun formatAccessibleReset(epochSeconds: Long): String =
            DateFormat.getDateTimeInstance(
                DateFormat.MEDIUM,
                DateFormat.SHORT,
                L10n.locale,
            ).format(Date(epochSeconds * 1_000))
    }
}
