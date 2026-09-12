package inmerzion.statusline.widget

import inmerzion.statusline.localization.L10n

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
import inmerzion.statusline.data.StatusCache
import inmerzion.statusline.protocol.UsageStatus
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

    fun layoutSize(widthDp: Float, heightDp: Float): WidgetLayoutSize = when {
        heightDp < TALL_MIN_HEIGHT_DP -> WidgetLayoutSize.COMPACT
        widthDp >= MEDIUM_MIN_WIDTH_DP -> WidgetLayoutSize.MEDIUM
        else -> WidgetLayoutSize.SMALL
    }

    fun terminalStripe(remainingPercentage: Int, widthDp: Float, stepDp: Float = 6f): Int {
        val edge = widthDp * remainingPercentage.coerceIn(0, 100) / 100f
        return if (edge > 0 && stepDp > 0) (ceil(edge / stepDp).toInt() - 1).coerceAtLeast(0) else -1
    }
}

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
        val status = StatusCache(context).load()
        appWidgetIds.forEach { widgetId ->
            updateWidget(context, appWidgetManager, widgetId, status)
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
            status = StatusCache(context).load(),
            options = newOptions,
        )
    }

    companion object {
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, StatuslineWidgetProvider::class.java)
            val status = StatusCache(context).load()
            manager.getAppWidgetIds(component).forEach { widgetId ->
                updateWidget(context, manager, widgetId, status)
            }
        }

        private fun updateWidget(
            context: Context,
            manager: AppWidgetManager,
            widgetId: Int,
            status: UsageStatus?,
            options: Bundle = manager.getAppWidgetOptions(widgetId),
        ) {
            manager.updateAppWidget(
                widgetId,
                responsiveViews(context, status, options),
            )
        }

        private fun responsiveViews(
            context: Context,
            status: UsageStatus?,
            options: Bundle,
        ): RemoteViews {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val sizes = widgetSizes(options)
                if (!sizes.isNullOrEmpty()) {
                    val mappings = LinkedHashMap<SizeF, RemoteViews>()
                    sizes.distinct().take(16).forEach { size ->
                        mappings[size] = sizedViews(
                            context = context,
                            status = status,
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
                status = status,
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
            status: UsageStatus?,
            widthDp: Float,
            heightDp: Float,
        ): RemoteViews {
            val layout = when (WidgetLayoutPolicy.layoutSize(widthDp, heightDp)) {
                WidgetLayoutSize.COMPACT -> R.layout.statusline_widget_compact
                WidgetLayoutSize.SMALL -> R.layout.statusline_widget_small
                WidgetLayoutSize.MEDIUM -> R.layout.statusline_widget
            }
            return RemoteViews(context.packageName, layout).also { views ->
                bindLaunchAction(context, views)
                bindStatus(context, views, status, (widthDp - 24f).coerceAtLeast(1f),
                    WidgetLayoutPolicy.layoutSize(widthDp, heightDp) == WidgetLayoutSize.SMALL)
                if (WidgetLayoutPolicy.layoutSize(widthDp, heightDp) == WidgetLayoutSize.SMALL) {
                    val numberSize = minOf(46f, heightDp - 86f, (widthDp - 50f) / 1.8f).coerceAtLeast(18f)
                    views.setTextViewTextSize(R.id.widgetQuotaNumber, TypedValue.COMPLEX_UNIT_SP, numberSize)
                }
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
            status: UsageStatus?,
            meterWidthDp: Float,
            small: Boolean,
        ) {
            val populated = status != null
            // Set even the XML labels explicitly: an unsupported primary language
            // must not select secondary Spanish from Android's resource fallback.
            mapOf(
                R.id.widget_weekly_limit_label to "Weekly",
                R.id.widget_weekly_limit_label_empty to "Weekly",
                R.id.widget_no_data_label to "NO DATA",
                R.id.widget_resets_label to "Resets",
                R.id.widget_connect_companion to "CONNECT COMPANION",
            ).forEach { (id, key) -> views.setTextViewText(id, L10n.text(key)) }
            views.setTextViewText(R.id.widget_weekly_limit_label, "Codex · " + L10n.text("Weekly"))
            views.setInt(R.id.widgetRoot, "setLayoutDirection", View.LAYOUT_DIRECTION_LTR)
            views.setViewVisibility(
                R.id.widgetPopulated,
                if (populated) View.VISIBLE else View.GONE,
            )
            views.setViewVisibility(
                R.id.widgetEmpty,
                if (populated) View.GONE else View.VISIBLE,
            )

            if (status == null) {
                views.setImageViewBitmap(R.id.widgetEmptyMeter, meterBitmap(context, 0, meterWidthDp, small))
                views.setContentDescription(
                    R.id.widgetRoot,
                    L10n.text("No Statusline data. Tap to open the app and connect a companion."),
                )
                return
            }

            val normalized = status.remainingPercentage.coerceIn(0, 100)
            views.setTextViewText(R.id.widgetQuotaNumber, normalized.toString())
            val elapsed = (System.currentTimeMillis() / 1_000 - status.updatedAtEpochSeconds).coerceAtLeast(0)
            val age = when {
                elapsed < 60 -> L10n.text("NOW")
                elapsed < 3_600 -> L10n.text("{0} MIN AGO", elapsed / 60)
                elapsed < 86_400 -> L10n.text("{0} H AGO", elapsed / 3_600)
                else -> L10n.text("{0} D AGO", elapsed / 86_400)
            }
            views.setTextViewText(R.id.widgetState, if (status.isDemo) L10n.text("DEMO") else age)
            views.setTextColor(R.id.widgetQuotaPercent, context.getColor(R.color.data_plane_muted))
            views.setImageViewBitmap(R.id.widgetMeter, meterBitmap(context, normalized, meterWidthDp, small))
            views.setTextViewText(
                R.id.widgetResetTime,
                formatReset(status.resetAtEpochSeconds, "HH:mm"),
            )
            views.setTextViewText(
                R.id.widgetResetDate,
                formatReset(status.resetAtEpochSeconds, "dd MMM"),
            )
            val description = L10n.text("{0} percent remaining. Resets {1}", normalized,
                formatAccessibleReset(status.resetAtEpochSeconds)) + ". " + L10n.text("Last sample: {0}", age)
            views.setContentDescription(R.id.widgetRoot,
                if (status.isDemo) L10n.text("Demo sample. {0}", description) else description)
        }

        private fun meterBitmap(context: Context, remainingPercentage: Int, widthDp: Float, small: Boolean): Bitmap {
            val density = context.resources.displayMetrics.density
            val heightDp = if (small) 5f else 6f
            val bitmap = Bitmap.createBitmap(
                (widthDp * density).toInt().coerceAtLeast(1),
                (heightDp * density).toInt().coerceAtLeast(1),
                Bitmap.Config.ARGB_8888,
            )
            val canvas = Canvas(bitmap)
            canvas.scale(density, density)
            val stripe = if (small) 2f else 4f
            val step = stripe * 1.5f
            val terminal = WidgetLayoutPolicy.terminalStripe(remainingPercentage, widthDp, step)
            val paint = Paint().apply { isAntiAlias = false; style = Paint.Style.FILL }
            var x = 0f
            var index = 0
            while (x < widthDp) {
                paint.color = when {
                    index == terminal -> android.graphics.Color.WHITE
                    index < terminal -> context.getColor(R.color.data_plane_signal)
                    else -> context.getColor(R.color.data_plane_track)
                }
                canvas.drawRect(x, 0f, (x + stripe).coerceAtMost(widthDp), heightDp, paint)
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
