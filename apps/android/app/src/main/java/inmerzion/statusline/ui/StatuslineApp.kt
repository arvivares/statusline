package inmerzion.statusline.ui

import inmerzion.statusline.localization.L10n

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import kotlin.math.ceil
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
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
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
import inmerzion.statusline.protocol.AgentProviderId
import inmerzion.statusline.protocol.AgentProviderReading
import inmerzion.statusline.protocol.AgentQuotaPeriod
import inmerzion.statusline.protocol.AgentQuotaWindow
import java.text.SimpleDateFormat
import java.util.Date
import kotlin.math.max

@Composable
fun StatuslineApp(
    viewModel: StatuslineViewModel,
    onSelectProvider: (AgentProviderId) -> Unit,
    onScanPairing: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSupport: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var pairingPresented by remember { mutableStateOf(false) }
    var disconnectPresented by remember { mutableStateOf(false) }
    var syncExpanded by rememberSaveable { mutableStateOf(false) }
    val scrollState = rememberScrollState()
    val focusHeading = remember { FocusRequester() }
    var requestedFocus by remember { mutableStateOf<AgentProviderId?>(null) }
    val periods = remember { mutableStateMapOf<AgentProviderId, AgentQuotaPeriod>() }
    val focused = state.focusedProvider

    LaunchedEffect(focused?.id) {
        // A background refresh must not steal focus from a control or an open dialog.
        if (requestedFocus != null && focused?.id == requestedFocus) {
            scrollState.scrollTo(0)
            focusHeading.requestFocus()
        }
        requestedFocus = null
    }

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
            Column(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .widthIn(max = 720.dp)
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .verticalScroll(scrollState)
                    .padding(horizontal = 28.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                DataPlaneHeader(state.phase)
                if (focused != null) {
                    AgentFocusPanel(
                        provider = focused,
                        period = periods[focused.id] ?: focused.defaultPeriod,
                        onSelectPeriod = { periods[focused.id] = it },
                        isDemo = state.isDemo,
                        focusRequester = focusHeading,
                    )
                    AgentWatchlist(
                        providers = state.inventory?.providers.orEmpty().filter { it.id != focused.id },
                        periods = periods,
                        isDemo = state.isDemo,
                        onSelect = { id ->
                            requestedFocus = id
                            onSelectProvider(id)
                        },
                    )
                    SecondaryButton(
                        label = L10n.text("Refresh"),
                        enabled = state.isPaired && !state.isBusy,
                        onClick = { viewModel.refresh() },
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                    PlaneDivider()
                    TextButton(
                        onClick = { syncExpanded = !syncExpanded },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics {
                            stateDescription = L10n.text(if (syncExpanded) "Expanded" else "Collapsed")
                        },
                        colors = ButtonDefaults.textButtonColors(contentColor = DataPlaneColors.Ink),
                    ) {
                        Text(L10n.text("Private sync"))
                        Spacer(Modifier.weight(1f))
                        Text(if (syncExpanded) "−" else "+", modifier = Modifier.clearAndSetSemantics {})
                    }
                } else {
                    WaitingPanel(state.phase, hasInventory = state.inventory != null)
                }
                if (focused == null || syncExpanded) RelayPanel(
                    state = state,
                    onRefresh = { viewModel.refresh() },
                    onPair = { pairingPresented = true },
                    onDisconnect = { disconnectPresented = true },
                    onShowDemo = { if (!state.isPaired && !state.isBusy) viewModel.showDemo() },
                    onClearDemo = { if (!state.isPaired && !state.isBusy) viewModel.clearDemo() },
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
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(L10n.text("Statusline"), fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = DataPlaneColors.Ink)
        Spacer(Modifier.weight(1f))
        StatusIndicator(phase.indicator, phase.tint)
    }
}

@Composable
private fun AgentFocusPanel(
    provider: AgentProviderReading,
    period: AgentQuotaPeriod,
    onSelectPeriod: (AgentQuotaPeriod) -> Unit,
    isDemo: Boolean,
    focusRequester: FocusRequester,
) {
    val activePeriod = provider.activePeriod(period)
    val window = provider.window(activePeriod)
    val ready = provider.status == "ready" && window != null
    val percentage = window?.remainingPercentage?.coerceIn(0, 100) ?: 0
    val providerName = provider.displayLabel
    val windowLabel = window?.displayLabel ?: L10n.text("Unavailable")

    DataPlaneSurface {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(focusRequester)
                        .focusable()
                        .semantics {
                            contentDescription = L10n.text("Focused service: {0}", providerName)
                        },
                ) {
                    Text(
                        providerName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                        color = DataPlaneColors.Ink,
                    )
                    PlaneLabel(provider.sourceLabel)
                }
                PlaneLabel(
                    if (ready) windowLabel else L10n.text("Unavailable"),
                    tint = if (ready) DataPlaneColors.Signal else DataPlaneColors.Muted,
                )
            }
            PlaneDivider()
            Column(
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clearAndSetSemantics {
                            contentDescription = if (ready) {
                                L10n.text("{0} percent remaining", percentage)
                            } else {
                                L10n.text("Unavailable")
                            }
                        },
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = if (ready) percentage.toString() else "—",
                        fontSize = 88.sp,
                        lineHeight = 88.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = (-4).sp,
                        color = DataPlaneColors.Ink,
                        maxLines = 1,
                    )
                    Text(
                        text = if (ready) "%" else L10n.text("NO DATA"),
                        fontSize = if (ready) 30.sp else 12.sp,
                        color = DataPlaneColors.Muted,
                        modifier = Modifier.padding(start = 12.dp, bottom = if (ready) 12.dp else 18.dp),
                    )
                }
                Text(
                    text = if (ready) L10n.text("remaining") else L10n.text("Check this service in Companion."),
                    style = MaterialTheme.typography.bodyMedium,
                    color = DataPlaneColors.Muted,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
                QuotaMeter(percentage, empty = !ready)
                if (ready) {
                    Text(
                        text = L10n.text("Resets") + " " + formatDate(window.resetAtEpochSeconds, "dd MMM · HH:mm"),
                        style = MaterialTheme.typography.bodySmall,
                        color = DataPlaneColors.Muted,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                }
                if (provider.hasBothWindows) {
                    Row(
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .heightIn(min = 48.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        listOf(AgentQuotaPeriod.WEEKLY, AgentQuotaPeriod.SHORT_WINDOW).forEach { candidate ->
                            val selected = activePeriod == candidate
                            TextButton(
                                onClick = { onSelectPeriod(candidate) },
                                modifier = Modifier
                                    .heightIn(min = 48.dp)
                                    .semantics {
                                        stateDescription = if (selected) L10n.text("Selected") else L10n.text("Not selected")
                                    },
                                colors = ButtonDefaults.textButtonColors(
                                    contentColor = if (selected) DataPlaneColors.Ink else DataPlaneColors.Muted,
                                ),
                            ) {
                                Text(
                                    candidate.label,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                )
                            }
                        }
                    }
                }
                Text(
                    text = when {
                        isDemo -> L10n.text("DEMO SAMPLE")
                        !ready -> L10n.text("Waiting for a fresh sample")
                        else -> L10n.text("Last sample: {0}", relativeAge(provider.updatedAtEpochSeconds))
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = DataPlaneColors.Muted,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
            }
        }
    }
}

@Composable
private fun AgentWatchlist(
    providers: List<AgentProviderReading>,
    periods: Map<AgentProviderId, AgentQuotaPeriod>,
    isDemo: Boolean,
    onSelect: (AgentProviderId) -> Unit,
) {
    if (providers.isEmpty()) return
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PlaneLabel(L10n.text("WATCHLIST"), tint = DataPlaneColors.Ink)
            Spacer(Modifier.weight(1f))
            PlaneLabel(L10n.text("SELECT SERVICE"))
        }
        Spacer(Modifier.height(4.dp))
        providers.forEach { provider ->
            val period = provider.activePeriod(periods[provider.id] ?: provider.defaultPeriod)
            val window = provider.window(period)
            val ready = provider.status == "ready" && window != null
            val percentage = window?.remainingPercentage?.coerceIn(0, 100)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .clickable { onSelect(provider.id) }
                    .semantics {
                        contentDescription = provider.watchlistDescription(isDemo)
                    }
                    .padding(horizontal = 2.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        provider.displayLabel,
                        style = MaterialTheme.typography.bodyMedium,
                        color = DataPlaneColors.Ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    PlaneLabel(if (ready) window.displayLabel else L10n.text("Unavailable"))
                }
                Text(
                    if (ready) "$percentage%" else "—",
                    style = MaterialTheme.typography.titleMedium,
                    color = if (ready) DataPlaneColors.Ink else DataPlaneColors.Muted,
                )
                Text(
                    L10n.text("Chevron right"),
                    style = MaterialTheme.typography.titleLarge,
                    color = DataPlaneColors.Muted,
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
            PlaneDivider()
        }
    }
}

private val AgentQuotaPeriod.label: String
    get() = when (this) {
        AgentQuotaPeriod.WEEKLY -> L10n.text("Weekly")
        AgentQuotaPeriod.SHORT_WINDOW -> L10n.text("Short window")
    }

private val AgentProviderReading.sourceLabel: String
    get() = when (id) {
        AgentProviderId.CODEX -> "OpenAI"
        AgentProviderId.ANTIGRAVITY -> "Google"
    }

private val AgentProviderReading.displayLabel: String
    get() = when (id) {
        AgentProviderId.CODEX -> L10n.text("OpenAI · Codex")
        AgentProviderId.ANTIGRAVITY -> L10n.text("Google · Antigravity")
    }

private val AgentProviderReading.hasBothWindows: Boolean
    get() = weekly != null && shortWindow != null

private fun AgentProviderReading.activePeriod(requested: AgentQuotaPeriod): AgentQuotaPeriod = when {
    requested == AgentQuotaPeriod.WEEKLY && weekly != null -> requested
    requested == AgentQuotaPeriod.SHORT_WINDOW && shortWindow != null -> requested
    weekly != null -> AgentQuotaPeriod.WEEKLY
    else -> AgentQuotaPeriod.SHORT_WINDOW
}

private val AgentQuotaWindow.displayLabel: String
    get() = when {
        windowMinutes >= 8_640 -> L10n.text("Weekly")
        windowMinutes % 60 == 0 -> L10n.text("{0}h", windowMinutes / 60)
        else -> L10n.text("{0} min", windowMinutes)
    }

private fun AgentProviderReading.watchlistDescription(isDemo: Boolean): String {
    val window = window(activePeriod(defaultPeriod))
    val value = if (status == "ready" && window != null) {
        L10n.text("{0} percent remaining", window.remainingPercentage)
    } else {
        L10n.text("Unavailable")
    }
    return buildList {
        add(displayLabel)
        add(value)
        add(if (isDemo) L10n.text("DEMO SAMPLE") else L10n.text("Tap to focus"))
    }.joinToString(". ")
}

@Composable
private fun WaitingPanel(phase: SyncPhase, hasInventory: Boolean) {
    DataPlaneSurface() {
        Column {
            PanelHeader(L10n.text("Your services"), L10n.text("NO SAMPLE"), accent = false)
            PlaneDivider()
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Row(modifier = Modifier.clearAndSetSemantics {
                    contentDescription = L10n.text("No quota sample")
                }, verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = "--",
                        style = MaterialTheme.typography.headlineLarge,
                        color = DataPlaneColors.Ink,
                    )
                    Text(
                        text = L10n.text("NO SAMPLE"),
                        style = MaterialTheme.typography.labelSmall,
                        color = DataPlaneColors.Muted,
                        modifier = Modifier.padding(start = 5.dp, bottom = 5.dp),
                    )
                }
                QuotaMeter(0, empty = true)
                Text(
                    text = when {
                        hasInventory -> L10n.text("Enable a supported service in your Companion to see its quota here.")
                        phase == SyncPhase.WAITING_FOR_DESKTOP -> L10n.text("Device connected. Waiting for the companion’s first sample.")
                        else -> L10n.text("Open Statusline Companion on Windows, Linux or macOS, create a pairing and scan its QR to receive the first encrypted sample.")
                    },
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
                text = L10n.text("The relay stores only AES-256-GCM encrypted quota snapshots. Your agents’ credentials and the encryption key never reach the relay."),
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
            .padding(start = 14.dp, top = 11.dp, bottom = 11.dp, end = 6.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
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
        TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
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
            text = L10n.text("Statusline is independent and is not affiliated with or endorsed by OpenAI or Google."),
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
                modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp),
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
                modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp),
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
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxWidth(),
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
        text = text,
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
                .size(5.dp)
                .clip(RoundedCornerShape(50))
                .background(tint),
        )
        PlaneLabel(label, tint = tint)
    }
}

@Composable
internal fun QuotaMeter(remainingPercentage: Int, empty: Boolean = false) {
    val normalized = if (empty) 0 else remainingPercentage.coerceIn(0, 100)
    Canvas(
        // The adjacent quota value provides the reading once to accessibility services.
        Modifier.fillMaxWidth().height(8.dp).clearAndSetSemantics {},
    ) {
        val stripe = 4.dp.toPx()
        val step = 6.dp.toPx()
        val edge = size.width * normalized / 100f
        val terminal = if (edge > 0) (ceil(edge / step).toInt() - 1).coerceAtLeast(0) else -1
        var x = 0f
        var index = 0
        while (x < size.width) {
            drawRect(
                color = when {
                    index == terminal -> DataPlaneColors.Terminal
                    x < edge -> DataPlaneColors.Signal
                    else -> DataPlaneColors.Track
                },
                topLeft = Offset(x, 0f),
                size = Size(stripe.coerceAtMost(size.width - x), size.height),
            )
            x += step
            index += 1
        }
    }
}

@Composable
internal fun PlaneDivider(modifier: Modifier = Modifier) {
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
        shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(
            containerColor = color,
            contentColor = DataPlaneColors.Canvas,
            disabledContainerColor = color.copy(alpha = 0.38f),
            disabledContentColor = DataPlaneColors.Canvas.copy(alpha = 0.7f),
        ),
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge)
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
            .background(DataPlaneColors.Track.copy(alpha = 0.45f), RoundedCornerShape(50)),
        enabled = enabled,
        shape = RoundedCornerShape(50),
        colors = ButtonDefaults.textButtonColors(
            contentColor = DataPlaneColors.Ink,
            disabledContentColor = DataPlaneColors.Muted.copy(alpha = 0.5f),
        ),
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge)
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
            L10n.text("Local demo enabled. The app and widget show an example sample.")
        SyncPhase.PAIRING -> L10n.text("Validating the encrypted pairing with the relay…")
        SyncPhase.SYNCING -> L10n.text("Looking for the latest encrypted snapshot…")
        SyncPhase.WAITING_FOR_DESKTOP ->
            L10n.text("Device connected. Waiting for the companion’s first sample.")
        SyncPhase.SYNCED -> L10n.text("An encrypted snapshot is available on this device.")
        SyncPhase.ERROR -> L10n.text("The last operation could not be completed.")
    }

internal fun formatDate(epochSeconds: Long, pattern: String): String =
    SimpleDateFormat(pattern, L10n.locale).format(Date(epochSeconds * 1_000))

internal fun relativeAge(epochSeconds: Long, nowEpochSeconds: Long = System.currentTimeMillis() / 1_000): String {
    val elapsed = max(0, nowEpochSeconds - epochSeconds)
    return when {
        elapsed < 60 -> L10n.text("NOW")
        elapsed < 3_600 -> L10n.text("{0} MIN AGO", elapsed / 60)
        elapsed < 86_400 -> L10n.text("{0} H AGO", elapsed / 3_600)
        else -> L10n.text("{0} D AGO", elapsed / 86_400)
    }
}
