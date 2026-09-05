package inmerzion.statusline.ui

import inmerzion.statusline.localization.L10n

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import inmerzion.statusline.StatuslineUiState
import inmerzion.statusline.StatuslineViewModel
import inmerzion.statusline.SyncPhase
import inmerzion.statusline.protocol.UsageStatus
import java.text.SimpleDateFormat
import java.util.Date
import kotlin.math.max

@Composable
fun StatuslineApp(
    viewModel: StatuslineViewModel,
    onScanPairing: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSupport: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var pairingPresented by remember { mutableStateOf(false) }
    var disconnectPresented by remember { mutableStateOf(false) }

    LaunchedEffect(state.phase) {
        if (state.phase == SyncPhase.SYNCED || state.phase == SyncPhase.WAITING_FOR_DESKTOP) {
            pairingPresented = false
        }
    }

    StatuslineTheme {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(DataPlaneColors.Canvas),
        ) {
            DataPlaneGrid()
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                DataPlaneHeader(state.phase)
                state.status?.let { status ->
                    QuotaPanel(status, state.phase)
                } ?: WaitingPanel(state.phase)
                RelayPanel(
                    state = state,
                    onRefresh = { viewModel.refresh() },
                    onPair = { pairingPresented = true },
                    onDisconnect = { disconnectPresented = true },
                    onShowDemo = viewModel::showDemo,
                    onClearDemo = viewModel::clearDemo,
                )
                state.feedback?.let { feedback ->
                    FeedbackPanel(
                        message = L10n.text(feedback.message),
                        isError = feedback.isError,
                        onDismiss = viewModel::clearFeedback,
                    )
                }
                PublicLinksFooter(
                    onOpenPrivacy = onOpenPrivacy,
                    onOpenSupport = onOpenSupport,
                )
            }
        }

        if (pairingPresented) {
            PairingDialog(
                busy = state.phase == SyncPhase.PAIRING,
                onDismiss = { if (!state.isBusy) pairingPresented = false },
                onScan = onScanPairing,
                onSubmit = viewModel::pair,
            )
        }
        if (disconnectPresented) {
            ConfirmDisconnectDialog(
                onDismiss = { disconnectPresented = false },
                onConfirm = {
                    disconnectPresented = false
                    viewModel.disconnect()
                },
            )
        }
    }
}

@Composable
private fun DataPlaneHeader(phase: SyncPhase) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PlaneLabel(L10n.text("STL / DATA PLANE"), tint = DataPlaneColors.Ink)
            Spacer(Modifier.weight(1f))
            StatusIndicator(phase.indicator, phase.tint)
        }
        Text(
            text = L10n.text("Codex Status"),
            style = MaterialTheme.typography.headlineLarge,
            color = DataPlaneColors.Ink,
        )
        Text(
            text = L10n.text("Weekly quota, reset and private sync in one view."),
            style = MaterialTheme.typography.bodyMedium,
            color = DataPlaneColors.Muted,
        )
    }
}

@Composable
private fun QuotaPanel(status: UsageStatus, phase: SyncPhase) {
    DataPlaneSurface(cornerRadius = 20) {
        Column {
            PanelHeader(L10n.text("CDX.WEEKLY.QUOTA"), L10n.text("PLANE / 010"))
            PlaneDivider()
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clearAndSetSemantics {
                            contentDescription =
                                L10n.text("{0} percent remaining", status.remainingPercentage)
                        },
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        Text(
                            text = status.remainingPercentage.toString(),
                            style = MaterialTheme.typography.displayLarge,
                            color = DataPlaneColors.Ink,
                            maxLines = 1,
                        )
                        Text(
                            text = "%",
                            color = DataPlaneColors.emphasis(status.remainingPercentage),
                            fontWeight = FontWeight.Bold,
                            fontSize = 30.sp,
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                        Text(
                            text = " " + L10n.text("LEFT"),
                            style = MaterialTheme.typography.labelSmall,
                            color = DataPlaneColors.emphasis(status.remainingPercentage),
                            modifier = Modifier.padding(bottom = 13.dp),
                            maxLines = 1,
                        )
                    }
                    Column(
                        modifier = Modifier.padding(bottom = 9.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        ContextValue(L10n.text("STATUS"), if (status.isDemo) L10n.text("DEMO SAMPLE") else L10n.text("AVAILABLE"))
                        ContextValue(L10n.text("SAMPLE"), relativeAge(status.updatedAtEpochSeconds))
                    }
                }
                QuotaMeter(status.remainingPercentage)
            }
            MetricsGrid(status, phase)
            PlaneDivider()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    PlaneLabel(L10n.text("STATUS.RECORD"))
                    Text(
                        text = if (status.isDemo) {
                            L10n.text("demo · local sample only")
                        } else {
                            L10n.text("available · quota metadata only")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = DataPlaneColors.Ink,
                    )
                }
                Spacer(Modifier.weight(1f))
                StatusIndicator(phase.indicator, phase.tint)
            }
        }
    }
}

@Composable
private fun WaitingPanel(phase: SyncPhase) {
    DataPlaneSurface(cornerRadius = 20) {
        Column {
            PanelHeader(L10n.text("CDX.WEEKLY.QUOTA"), L10n.text("NO SAMPLE"), accent = false)
            PlaneDivider()
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = "--",
                        style = MaterialTheme.typography.headlineLarge,
                        color = DataPlaneColors.Ink,
                    )
                    Text(
                        text = L10n.text("% LEFT"),
                        style = MaterialTheme.typography.labelSmall,
                        color = DataPlaneColors.Muted,
                        modifier = Modifier.padding(start = 5.dp, bottom = 5.dp),
                    )
                }
                QuotaMeter(0, empty = true)
                Text(
                    text = L10n.text("Open Statusline Companion on Windows, Linux or macOS, create a pairing and scan its QR to receive the first encrypted sample."),
                    style = MaterialTheme.typography.bodyMedium,
                    color = DataPlaneColors.Muted,
                )
            }
            PlaneDivider()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PlaneLabel(L10n.text("SOURCE.HOST"))
                Spacer(Modifier.weight(1f))
                StatusIndicator(phase.indicator, phase.tint)
            }
        }
    }
}

@Composable
private fun MetricsGrid(status: UsageStatus, phase: SyncPhase) {
    Column {
        Row(Modifier.fillMaxWidth()) {
            MetricCell(
                label = L10n.text("RESET.TIME"),
                value = formatDate(status.resetAtEpochSeconds, "HH:mm"),
                detail = L10n.text("LOCAL TIME"),
                accented = true,
                modifier = Modifier.weight(1f),
            )
            MetricCell(
                label = L10n.text("RESET.DATE"),
                value = formatDate(status.resetAtEpochSeconds, "dd MMM").uppercase(),
                detail = formatDate(status.resetAtEpochSeconds, "EEEE").uppercase(),
                accented = true,
                modifier = Modifier.weight(1f),
            )
        }
        Row(Modifier.fillMaxWidth()) {
            MetricCell(
                label = L10n.text("SOURCE.HOST"),
                value = if (status.isDemo) L10n.text("Review sample") else L10n.text("Desktop companion"),
                detail = if (status.isDemo) L10n.text("LOCAL · NO ACCOUNT") else L10n.text("CODEX SESSION LOCAL"),
                modifier = Modifier.weight(1f),
            )
            MetricCell(
                label = L10n.text("RELAY.STATE"),
                value = phase.relayValue,
                detail = if (status.isDemo) L10n.text("NO NETWORK") else L10n.text("E2E · UNIVERSAL"),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MetricCell(
    label: String,
    value: String,
    detail: String,
    modifier: Modifier = Modifier,
    accented: Boolean = false,
) {
    Column(
        modifier = modifier
            .heightIn(min = 94.dp)
            .background(DataPlaneColors.Surface.copy(alpha = 0.72f))
            .border(0.5.dp, DataPlaneColors.Line)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        PlaneLabel(label)
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = if (accented) DataPlaneColors.Signal else DataPlaneColors.Ink,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = detail,
            style = MaterialTheme.typography.labelSmall,
            color = DataPlaneColors.Muted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun RelayPanel(
    state: StatuslineUiState,
    onRefresh: () -> Unit,
    onPair: () -> Unit,
    onDisconnect: () -> Unit,
    onShowDemo: () -> Unit,
    onClearDemo: () -> Unit,
) {
    DataPlaneSurface {
        Column(
            modifier = Modifier.padding(17.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PlaneLabel(L10n.text("RELAY.CONTROL"), tint = DataPlaneColors.Ink)
                Spacer(Modifier.weight(1f))
                StatusIndicator(state.phase.indicator, state.phase.tint)
            }
            PlaneDivider()
            Text(
                text = state.phase.message,
                style = MaterialTheme.typography.bodySmall,
                color = if (state.phase == SyncPhase.ERROR) {
                    DataPlaneColors.Critical
                } else {
                    DataPlaneColors.Ink
                },
            )
            Text(
                text = L10n.text("The relay stores only an AES-256-GCM encrypted snapshot. Codex credentials and the encryption key never leave your devices."),
                style = MaterialTheme.typography.bodyMedium,
                color = DataPlaneColors.Muted,
            )
            state.endpoint?.let { endpoint ->
                Text(
                    text = endpoint,
                    style = MaterialTheme.typography.labelSmall,
                    color = DataPlaneColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.MiddleEllipsis,
                )
            }
            if (state.isPaired) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    PrimaryButton(
                        label = if (state.phase == SyncPhase.SYNCING) L10n.text("SYNCING…") else L10n.text("REFRESH"),
                        enabled = !state.isBusy,
                        onClick = onRefresh,
                        modifier = Modifier.weight(1f),
                    )
                    SecondaryButton(
                        label = L10n.text("DISCONNECT"),
                        enabled = !state.isBusy,
                        onClick = onDisconnect,
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    PrimaryButton(
                        label = if (state.phase == SyncPhase.PAIRING) {
                            L10n.text("PAIRING…")
                        } else {
                            L10n.text("PAIR DEVICE")
                        },
                        enabled = !state.isBusy,
                        onClick = onPair,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    SecondaryButton(
                        label = if (state.isDemo) L10n.text("CLEAR DEMO") else L10n.text("VIEW DEMO"),
                        enabled = !state.isBusy,
                        onClick = if (state.isDemo) onClearDemo else onShowDemo,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

@Composable
private fun FeedbackPanel(
    message: String,
    isError: Boolean,
    onDismiss: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DataPlaneColors.Surface.copy(alpha = 0.96f))
            .border(
                1.dp,
                if (isError) DataPlaneColors.Critical else DataPlaneColors.Line,
            )
            .padding(start = 14.dp, top = 11.dp, bottom = 11.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(7.dp)
                .background(if (isError) DataPlaneColors.Critical else DataPlaneColors.Signal),
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodySmall,
            color = if (isError) DataPlaneColors.Critical else DataPlaneColors.Ink,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 10.dp),
        )
        TextButton(onClick = onDismiss) {
            Text(L10n.text("CLOSE"), style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun PublicLinksFooter(
    onOpenPrivacy: () -> Unit,
    onOpenSupport: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 2.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PlaneLabel(L10n.text("PRIVACY / SUPPORT"))
            Spacer(Modifier.weight(1f))
            PlaneLabel(L10n.text("INDEPENDENT"), tint = DataPlaneColors.Ink)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SecondaryButton(
                label = L10n.text("PRIVACY"),
                onClick = onOpenPrivacy,
                modifier = Modifier.weight(1f),
            )
            SecondaryButton(
                label = L10n.text("SUPPORT"),
                onClick = onOpenSupport,
                modifier = Modifier.weight(1f),
            )
        }
        Text(
            text = L10n.text("Statusline is an independent app and is not affiliated with or endorsed by OpenAI."),
            style = MaterialTheme.typography.bodySmall,
            color = DataPlaneColors.Muted,
        )
    }
}

@Composable
private fun PairingDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onScan: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var pairingLink by remember { mutableStateOf("") }
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            color = DataPlaneColors.Surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, DataPlaneColors.Line),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(15.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PlaneLabel(L10n.text("PAIR.READER"), tint = DataPlaneColors.Ink)
                    Spacer(Modifier.weight(1f))
                    StatusIndicator(if (busy) L10n.text("PAIRING") else L10n.text("READY"), DataPlaneColors.Signal)
                }
                PlaneDivider()
                Text(
                    text = L10n.text("Scan the companion’s private QR. The code expires in ten minutes and can only be used once."),
                    style = MaterialTheme.typography.bodyMedium,
                    color = DataPlaneColors.Muted,
                )
                PrimaryButton(
                    label = L10n.text("SCAN QR"),
                    enabled = !busy,
                    onClick = onScan,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PlaneDivider(Modifier.weight(1f))
                    PlaneLabel(L10n.text("OR PASTE"), modifier = Modifier.padding(horizontal = 10.dp))
                    PlaneDivider(Modifier.weight(1f))
                }
                OutlinedTextField(
                    value = pairingLink,
                    onValueChange = { pairingLink = it },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                    singleLine = true,
                    label = { Text("statusline://pair?…") },
                    textStyle = MaterialTheme.typography.bodySmall,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        autoCorrectEnabled = false,
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = DataPlaneColors.Signal,
                        unfocusedBorderColor = DataPlaneColors.Line,
                        focusedTextColor = DataPlaneColors.Ink,
                        unfocusedTextColor = DataPlaneColors.Ink,
                        focusedLabelColor = DataPlaneColors.Signal,
                        unfocusedLabelColor = DataPlaneColors.Muted,
                        cursorColor = DataPlaneColors.Signal,
                    ),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    SecondaryButton(
                        label = L10n.text("CANCEL"),
                        enabled = !busy,
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                    )
                    PrimaryButton(
                        label = if (busy) L10n.text("CLAIMING…") else L10n.text("CONNECT"),
                        enabled = !busy && pairingLink.isNotBlank(),
                        onClick = { onSubmit(pairingLink) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun ConfirmDisconnectDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            color = DataPlaneColors.Surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, DataPlaneColors.Line),
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(15.dp),
            ) {
                PlaneLabel(L10n.text("DISCONNECT.READER"), tint = DataPlaneColors.Ink)
                PlaneDivider()
                Text(
                    text = L10n.text("The read token, encryption key and latest sample will be removed from this device. The companion will keep its channel."),
                    style = MaterialTheme.typography.bodyMedium,
                    color = DataPlaneColors.Muted,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    SecondaryButton(
                        label = L10n.text("CANCEL"),
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                    )
                    PrimaryButton(
                        label = L10n.text("DISCONNECT"),
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        color = DataPlaneColors.Critical,
                    )
                }
            }
        }
    }
}

@Composable
private fun DataPlaneSurface(
    cornerRadius: Int = 18,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(cornerRadius.dp))
            .background(DataPlaneColors.Surface.copy(alpha = 0.96f))
            .border(1.dp, DataPlaneColors.Line, RoundedCornerShape(cornerRadius.dp)),
    ) {
        content()
    }
}

@Composable
private fun PanelHeader(label: String, index: String, accent: Boolean = true) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlaneLabel(label)
        Spacer(Modifier.weight(1f))
        PlaneLabel(
            index,
            tint = if (accent) DataPlaneColors.Signal else DataPlaneColors.Muted,
        )
    }
}

@Composable
private fun PlaneLabel(
    text: String,
    modifier: Modifier = Modifier,
    tint: Color = DataPlaneColors.Muted,
) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = tint,
        modifier = modifier,
        maxLines = 1,
    )
}

@Composable
private fun StatusIndicator(label: String, tint: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Box(
            Modifier
                .size(7.dp)
                .background(tint),
        )
        PlaneLabel(label, tint = tint)
    }
}

@Composable
private fun ContextValue(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        PlaneLabel(label)
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = DataPlaneColors.Ink,
            maxLines = 1,
        )
    }
}

@Composable
private fun QuotaMeter(remainingPercentage: Int, empty: Boolean = false) {
    val normalized = remainingPercentage.coerceIn(0, 100)
    val fullSegments = if (empty) 0 else normalized / 5
    val partialSegment = !empty && normalized < 100 && normalized % 5 != 0
    Column(
        modifier = Modifier.clearAndSetSemantics {
            contentDescription = if (empty) {
                L10n.text("No quota sample")
            } else {
                L10n.text("{0} percent remaining", normalized)
            }
        },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            repeat(20) { index ->
                val color = when {
                    index < fullSegments -> DataPlaneColors.emphasis(normalized)
                    index == fullSegments && partialSegment -> DataPlaneColors.Ink
                    else -> Color.Transparent
                }
                Box(
                    Modifier
                        .weight(1f)
                        .height(11.dp)
                        .background(color)
                        .border(0.7.dp, DataPlaneColors.Line),
                )
            }
        }
        Row(Modifier.fillMaxWidth()) {
            PlaneLabel("0")
            Spacer(Modifier.weight(1f))
            PlaneLabel(if (empty) L10n.text("NO SAMPLE") else L10n.text("{0} / LEFT", normalized))
            Spacer(Modifier.weight(1f))
            PlaneLabel("100")
        }
    }
}

@Composable
private fun PlaneDivider(modifier: Modifier = Modifier) {
    HorizontalDivider(modifier, thickness = 1.dp, color = DataPlaneColors.Line)
}

@Composable
private fun PrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    color: Color = DataPlaneColors.Signal,
) {
    Button(
        onClick = onClick,
        modifier = modifier.heightIn(min = 48.dp),
        enabled = enabled,
        shape = RoundedCornerShape(0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = color,
            contentColor = DataPlaneColors.Canvas,
            disabledContainerColor = color.copy(alpha = 0.38f),
            disabledContentColor = DataPlaneColors.Canvas.copy(alpha = 0.7f),
        ),
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

@Composable
private fun SecondaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    TextButton(
        onClick = onClick,
        modifier = modifier
            .heightIn(min = 48.dp)
            .border(1.dp, DataPlaneColors.Line),
        enabled = enabled,
        shape = RoundedCornerShape(0.dp),
        colors = ButtonDefaults.textButtonColors(
            contentColor = DataPlaneColors.Ink,
            disabledContentColor = DataPlaneColors.Muted.copy(alpha = 0.5f),
        ),
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

private val SyncPhase.indicator: String
    get() = when (this) {
        SyncPhase.UNPAIRED -> L10n.text("UNPAIRED")
        SyncPhase.DEMO -> L10n.text("DEMO")
        SyncPhase.PAIRING -> L10n.text("PAIRING")
        SyncPhase.SYNCING -> L10n.text("SYNCING")
        SyncPhase.WAITING_FOR_DESKTOP -> L10n.text("WAITING")
        SyncPhase.SYNCED -> L10n.text("CURRENT")
        SyncPhase.ERROR -> L10n.text("FAULT")
    }

private val SyncPhase.relayValue: String
    get() = when (this) {
        SyncPhase.UNPAIRED -> L10n.text("UNPAIRED")
        SyncPhase.DEMO -> L10n.text("LOCAL DEMO")
        SyncPhase.PAIRING -> L10n.text("CLAIMING")
        SyncPhase.SYNCING -> L10n.text("READING")
        SyncPhase.WAITING_FOR_DESKTOP -> L10n.text("WAITING")
        SyncPhase.SYNCED -> L10n.text("CURRENT")
        SyncPhase.ERROR -> L10n.text("FAULT")
    }

private val SyncPhase.tint: Color
    get() = when (this) {
        SyncPhase.ERROR -> DataPlaneColors.Critical
        SyncPhase.UNPAIRED, SyncPhase.WAITING_FOR_DESKTOP -> DataPlaneColors.Muted
        else -> DataPlaneColors.Signal
    }

private val SyncPhase.message: String
    get() = when (this) {
        SyncPhase.UNPAIRED ->
            L10n.text("Scan the QR shown by Statusline Companion to connect this device.")
        SyncPhase.DEMO ->
            L10n.text("Local sample to explore the app and widget. No network or Codex account is used.")
        SyncPhase.PAIRING -> L10n.text("Validating the encrypted pairing with the relay…")
        SyncPhase.SYNCING -> L10n.text("Looking for the latest encrypted snapshot…")
        SyncPhase.WAITING_FOR_DESKTOP ->
            L10n.text("Device connected. Waiting for the companion’s first sample.")
        SyncPhase.SYNCED -> L10n.text("An encrypted snapshot is available on this device.")
        SyncPhase.ERROR -> L10n.text("The last operation could not be completed.")
    }

private fun formatDate(epochSeconds: Long, pattern: String): String =
    SimpleDateFormat(pattern, L10n.locale).format(Date(epochSeconds * 1_000))

private fun relativeAge(epochSeconds: Long): String {
    val elapsed = max(0, System.currentTimeMillis() / 1_000 - epochSeconds)
    return when {
        elapsed < 60 -> L10n.text("NOW")
        elapsed < 3_600 -> L10n.text("{0} MIN AGO", elapsed / 60)
        elapsed < 86_400 -> L10n.text("{0} H AGO", elapsed / 3_600)
        else -> L10n.text("{0} D AGO", elapsed / 86_400)
    }
}
