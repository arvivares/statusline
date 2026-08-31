package inmerzion.statusline.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.os.Bundle
import android.util.SizeF
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
import java.util.Locale

internal enum class WidgetSegmentFill {
    FULL,
    PARTIAL,
    EMPTY,
}

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

    fun segmentFill(index: Int, remainingPercentage: Int): WidgetSegmentFill {
        val normalized = remainingPercentage.coerceIn(0, 100)
        val fullSegments = normalized / 5
        val hasPartialSegment = normalized < 100 && normalized % 5 != 0
        return when {
            index < fullSegments -> WidgetSegmentFill.FULL
            index == fullSegments && hasPartialSegment -> WidgetSegmentFill.PARTIAL
            else -> WidgetSegmentFill.EMPTY
        }
    }
}

class StatuslineWidgetProvider : AppWidgetProvider() {
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
        private const val SEGMENT_COUNT = 20
        private const val METER_BITMAP_WIDTH = 600
        private const val METER_BITMAP_HEIGHT = 21
        private const val METER_SEGMENT_GAP = 3f
        private const val METER_STROKE_WIDTH = 1.5f

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
                bindStatus(context, views, status)
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
        ) {
            val populated = status != null
            views.setViewVisibility(
                R.id.widgetPopulated,
                if (populated) View.VISIBLE else View.GONE,
            )
            views.setViewVisibility(
                R.id.widgetEmpty,
                if (populated) View.GONE else View.VISIBLE,
            )

            if (status == null) {
                views.setImageViewBitmap(R.id.widgetEmptyMeter, meterBitmap(context, 0))
                views.setContentDescription(
                    R.id.widgetRoot,
                    "Statusline sin datos. Toca para abrir la aplicación y conectar un companion.",
                )
                return
            }

            val normalized = status.remainingPercentage.coerceIn(0, 100)
            val emphasisColor = context.getColor(
                if (normalized <= 20) {
                    R.color.data_plane_critical
                } else {
                    R.color.data_plane_signal
                },
            )
            views.setTextViewText(R.id.widgetQuotaNumber, normalized.toString())
            views.setTextViewText(R.id.widgetState, if (status.isDemo) "DEMO" else "LIVE")
            views.setTextColor(R.id.widgetQuotaPercent, emphasisColor)
            views.setImageViewBitmap(R.id.widgetMeter, meterBitmap(context, normalized))
            views.setTextViewText(R.id.widgetMeterScaleValue, "$normalized LEFT")
            views.setTextViewText(
                R.id.widgetResetTime,
                formatReset(status.resetAtEpochSeconds, "HH:mm"),
            )
            views.setTextViewText(
                R.id.widgetResetDate,
                formatReset(status.resetAtEpochSeconds, "dd MMM"),
            )
            views.setContentDescription(
                R.id.widgetRoot,
                (if (status.isDemo) "Muestra de demostración. " else "") +
                    "Límite semanal de Codex: $normalized por ciento restante. " +
                    "Reinicio ${formatAccessibleReset(status.resetAtEpochSeconds)}.",
            )
        }

        private fun meterBitmap(context: Context, remainingPercentage: Int): Bitmap {
            val normalized = remainingPercentage.coerceIn(0, 100)
            val signalColor = context.getColor(
                if (normalized <= 20 && normalized > 0) {
                    R.color.data_plane_critical
                } else {
                    R.color.data_plane_signal
                },
            )
            val partialColor = context.getColor(R.color.data_plane_ink)
            val lineColor = context.getColor(R.color.data_plane_line)
            val bitmap = Bitmap.createBitmap(
                METER_BITMAP_WIDTH,
                METER_BITMAP_HEIGHT,
                Bitmap.Config.ARGB_8888,
            )
            val canvas = Canvas(bitmap)
            val fillPaint = Paint().apply {
                isAntiAlias = false
                style = Paint.Style.FILL
            }
            val strokePaint = Paint().apply {
                isAntiAlias = false
                color = lineColor
                style = Paint.Style.STROKE
                strokeWidth = METER_STROKE_WIDTH
            }
            val totalGap = METER_SEGMENT_GAP * (SEGMENT_COUNT - 1)
            val segmentWidth = (METER_BITMAP_WIDTH - totalGap) / SEGMENT_COUNT
            val inset = METER_STROKE_WIDTH / 2f

            repeat(SEGMENT_COUNT) { index ->
                val left = index * (segmentWidth + METER_SEGMENT_GAP)
                val bounds = RectF(
                    left + inset,
                    inset,
                    left + segmentWidth - inset,
                    METER_BITMAP_HEIGHT - inset,
                )
                val fillColor = when (WidgetLayoutPolicy.segmentFill(index, normalized)) {
                    WidgetSegmentFill.FULL -> signalColor
                    WidgetSegmentFill.PARTIAL -> partialColor
                    WidgetSegmentFill.EMPTY -> Color.TRANSPARENT
                }
                if (fillColor != Color.TRANSPARENT) {
                    fillPaint.color = fillColor
                    canvas.drawRect(bounds, fillPaint)
                }
                canvas.drawRect(bounds, strokePaint)
            }
            return bitmap
        }

        private fun formatReset(epochSeconds: Long, pattern: String): String =
            SimpleDateFormat(pattern, Locale.getDefault())
                .format(Date(epochSeconds * 1_000))
                .uppercase(Locale.getDefault())

        private fun formatAccessibleReset(epochSeconds: Long): String =
            DateFormat.getDateTimeInstance(
                DateFormat.MEDIUM,
                DateFormat.SHORT,
                Locale.getDefault(),
            ).format(Date(epochSeconds * 1_000))
    }
}
