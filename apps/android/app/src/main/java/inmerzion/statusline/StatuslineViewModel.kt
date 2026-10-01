package inmerzion.statusline

import android.app.Application
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import inmerzion.statusline.data.StatuslineRepository
import inmerzion.statusline.protocol.AgentProviderId
import inmerzion.statusline.protocol.AgentProviderReading
import inmerzion.statusline.protocol.AgentServicesSnapshot
import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.StatuslineException
import inmerzion.statusline.protocol.UsageStatus
import inmerzion.statusline.widget.StatuslineWidgetProvider
import com.google.android.gms.tasks.Tasks
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

enum class SyncPhase {
    UNPAIRED,
    DEMO,
    PAIRING,
    SYNCING,
    WAITING_FOR_DESKTOP,
    SYNCED,
    ERROR,
}

data class UserFeedback(
    val message: String,
    val isError: Boolean,
)

data class StatuslineUiState(
    /** Compatibility projection for older UI/tests and the legacy Codex model. */
    val status: UsageStatus? = null,
    val inventory: AgentServicesSnapshot? = null,
    val focusId: AgentProviderId? = null,
    val phase: SyncPhase = SyncPhase.UNPAIRED,
    val endpoint: String? = null,
    val feedback: UserFeedback? = null,
    val isPaired: Boolean = false,
    val resetNotificationsEnabled: Boolean = false,
    val resetNotificationsBusy: Boolean = false,
) {
    val isBusy: Boolean
        get() = phase == SyncPhase.PAIRING || phase == SyncPhase.SYNCING

    val isDemo: Boolean
        get() = inventory?.isDemo == true || status?.isDemo == true

    val focusedProvider: AgentProviderReading?
        get() = inventory?.focusedProvider(focusId)
}

class StatuslineViewModel(application: Application) : AndroidViewModel(application) {
    private val repositoryResult = runCatching { StatuslineRepository(application) }
    private val repository = repositoryResult.getOrNull()
    private val initialInventory = runCatching { repository?.cachedServices() }.getOrNull()
    private val initialFocus = runCatching { repository?.focusedProviderId() }.getOrNull()
    private val initialStatus = initialInventory
        ?.focusedProvider(initialFocus)
        ?.usageStatus(initialInventory.isDemo)
        ?: runCatching { repository?.cachedStatus() }.getOrNull()
    private val mutableState = MutableStateFlow(
        StatuslineUiState(
            status = initialStatus,
            inventory = initialInventory,
            focusId = initialFocus,
            endpoint = repository?.endpoint,
            resetNotificationsEnabled = repository?.resetNotificationsEnabled() == true,
        ),
    )
    private var operation: Job? = null
    private var initialized = false

    val state: StateFlow<StatuslineUiState> = mutableState.asStateFlow()

    fun initialize(pairingUri: String?) {
        if (initialized) {
            pairingUri?.let(::pair)
            return
        }
        initialized = true

        val repositoryError = repositoryResult.exceptionOrNull()
        if (repositoryError != null) {
            showFailure(repositoryError)
            return
        }
        if (pairingUri != null) {
            pair(pairingUri)
        } else {
            refresh(userInitiated = false)
            refreshPushRegistration()
        }
    }

    fun pair(rawValue: String) {
        if (rawValue.isBlank()) {
            mutableState.value = mutableState.value.copy(
                feedback = UserFeedback(
                    "Paste the link shown by Statusline Companion first.",
                    isError = true,
                ),
            )
            return
        }
        if (operation?.isActive == true) return
        val activeRepository = repository ?: return
        mutableState.value = mutableState.value.copy(
            phase = SyncPhase.PAIRING,
            feedback = null,
        )
        operation = viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { activeRepository.pair(rawValue) }
            }.onSuccess { snapshot ->
                applySnapshot(
                    snapshot = snapshot,
                    phase = if (snapshot == null) SyncPhase.WAITING_FOR_DESKTOP else SyncPhase.SYNCED,
                    paired = true,
                    feedback = UserFeedback(
                        "Device connected with encryption.",
                        isError = false,
                    ),
                )
                updateWidgets()
                refreshPushRegistration()
            }.onFailure(::showFailure)
        }
    }

    fun refresh(userInitiated: Boolean = true) {
        if (operation?.isActive == true) return
        val activeRepository = repository ?: return
        operation = viewModelScope.launch {
            val paired = runCatching {
                withContext(Dispatchers.IO) { activeRepository.isPaired() }
            }.getOrElse {
                showFailure(it)
                return@launch
            }
            if (!paired) {
                mutableState.value = mutableState.value.copy(
                    phase = if (mutableState.value.isDemo) SyncPhase.DEMO else SyncPhase.UNPAIRED,
                    feedback = null,
                    isPaired = false,
                )
                return@launch
            }

            mutableState.value = mutableState.value.copy(
                phase = SyncPhase.SYNCING,
                isPaired = true,
                feedback = if (userInitiated) null else mutableState.value.feedback,
            )
            runCatching {
                withContext(Dispatchers.IO) { activeRepository.refresh() }
            }.onSuccess { snapshot ->
                applySnapshot(
                    snapshot = snapshot,
                    phase = if (snapshot == null) SyncPhase.WAITING_FOR_DESKTOP else SyncPhase.SYNCED,
                    paired = true,
                    feedback = if (userInitiated) {
                        UserFeedback("Encrypted snapshot updated.", isError = false)
                    } else {
                        null
                    },
                )
                updateWidgets()
            }.onFailure(::showFailure)
        }
    }

    fun refreshIfPaired() {
        if (mutableState.value.isPaired) {
            refresh(userInitiated = false)
            refreshPushRegistration()
        }
    }

    fun enableResetNotifications() {
        val activeRepository = repository ?: return
        if (!mutableState.value.isPaired) return
        if (!StatuslineApplication.isPushConfigured()) {
            mutableState.value = mutableState.value.copy(
                feedback = UserFeedback("Push notifications are not configured for this build.", isError = true),
            )
            return
        }
        mutableState.value = mutableState.value.copy(resetNotificationsBusy = true)
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val messaging = FirebaseMessaging.getInstance()
                    messaging.isAutoInitEnabled = true
                    Tasks.await(messaging.register(), 30, TimeUnit.SECONDS)
                    val installationId = Tasks.await(FirebaseInstallations.getInstance().id, 30, TimeUnit.SECONDS)
                    require(installationId.isNotBlank())
                    activeRepository.registerResetNotifications(installationId, inmerzion.statusline.localization.L10n.locale.language)
                }
            }.onSuccess {
                mutableState.value = mutableState.value.copy(
                    resetNotificationsEnabled = true,
                    resetNotificationsBusy = false,
                    feedback = UserFeedback("Notifications are ready. Statusline will alert you when Codex reset credits are added.", isError = false),
                )
            }.onFailure {
                withContext(Dispatchers.IO) {
                    runCatching { activeRepository.unregisterResetNotifications() }
                    disableFirebasePushRegistration()
                }
                mutableState.value = mutableState.value.copy(
                    resetNotificationsBusy = false,
                    resetNotificationsEnabled = activeRepository.resetNotificationsEnabled(),
                    feedback = UserFeedback("Could not enable notifications. Check your connection and try again.", isError = true),
                )
            }
        }
    }

    fun prepareResetNotifications(onRelayAvailable: () -> Unit) {
        val activeRepository = repository ?: return
        if (!mutableState.value.isPaired) return
        if (!StatuslineApplication.isPushConfigured()) {
            mutableState.value = mutableState.value.copy(
                feedback = UserFeedback("Push notifications are not configured for this build.", isError = true),
            )
            return
        }
        mutableState.value = mutableState.value.copy(resetNotificationsBusy = true)
        viewModelScope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) { activeRepository.supportsResetPush() }
            }
            mutableState.value = mutableState.value.copy(resetNotificationsBusy = false)
            result.onSuccess { available ->
                if (available) {
                    onRelayAvailable()
                } else {
                    mutableState.value = mutableState.value.copy(
                        feedback = UserFeedback("Push notifications are not available on this relay yet.", isError = true),
                    )
                }
            }.onFailure { error ->
                val failure = error as? StatuslineException
                mutableState.value = mutableState.value.copy(
                    feedback = UserFeedback(failureMessage(failure?.kind), isError = true),
                )
            }
        }
    }

    fun disableResetNotifications() {
        val activeRepository = repository ?: return
        if (!mutableState.value.resetNotificationsEnabled) return
        activeRepository.beginResetNotificationRemoval()
        if (StatuslineApplication.isPushConfigured()) {
            FirebaseMessaging.getInstance().isAutoInitEnabled = false
        }
        mutableState.value = mutableState.value.copy(
            resetNotificationsEnabled = false,
            resetNotificationsBusy = true,
        )
        viewModelScope.launch {
            val relayUnregistered = withContext(Dispatchers.IO) {
                if (StatuslineApplication.isPushConfigured()) {
                    disableFirebasePushRegistration()
                }
                val removed = runCatching { activeRepository.unregisterResetNotifications() }.isSuccess
                removed
            }
            mutableState.value = mutableState.value.copy(
                resetNotificationsBusy = false,
                resetNotificationsEnabled = false,
                feedback = if (relayUnregistered) {
                    UserFeedback("Notifications are off. This device was unregistered.", isError = false)
                } else {
                    UserFeedback("Notifications are off on this device. Relay cleanup will retry when you open Statusline.", isError = true)
                },
            )
        }
    }

    fun notificationPermissionDenied() {
        mutableState.value = mutableState.value.copy(
            feedback = UserFeedback("Allow notifications in Android Settings to receive Codex reset alerts.", isError = true),
        )
    }

    private fun refreshPushRegistration() {
        val activeRepository = repository ?: return
        viewModelScope.launch {
            val permissionWasRevoked = withContext(Dispatchers.IO) {
                val permissionMissing = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    getApplication<Application>().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED
                if (permissionMissing && activeRepository.resetNotificationsEnabled()) {
                    activeRepository.beginResetNotificationRemoval()
                    disableFirebasePushRegistration()
                    runCatching { activeRepository.unregisterResetNotifications() }
                    true
                } else {
                    false
                }
            }
            if (permissionWasRevoked) {
                mutableState.value = mutableState.value.copy(
                    resetNotificationsEnabled = false,
                    resetNotificationsBusy = false,
                    feedback = UserFeedback("Allow notifications in Android Settings to receive Codex reset alerts.", isError = true),
                )
                return@launch
            }
            runCatching {
                withContext(Dispatchers.IO) {
                    activeRepository.retryResetNotificationRemoval()
                    if (!StatuslineApplication.isPushConfigured()) return@withContext
                    if (activeRepository.resetNotificationsEnabled() && activeRepository.isPaired()) {
                        val messaging = FirebaseMessaging.getInstance()
                        messaging.isAutoInitEnabled = true
                        Tasks.await(messaging.register(), 30, TimeUnit.SECONDS)
                        val installationId = Tasks.await(FirebaseInstallations.getInstance().id, 30, TimeUnit.SECONDS)
                        activeRepository.registerResetNotifications(
                            installationId,
                            inmerzion.statusline.localization.L10n.locale.language,
                        )
                    }
                }
            }
        }
    }

    fun selectProvider(provider: AgentProviderId) {
        val activeRepository = repository ?: return
        val snapshot = mutableState.value.inventory ?: return
        if (snapshot.providers.none { it.id == provider }) return
        activeRepository.selectProvider(provider)
        val status = snapshot.focusedProvider(provider)?.usageStatus(snapshot.isDemo)
        mutableState.value = mutableState.value.copy(
            focusId = provider,
            status = status,
        )
        updateWidgets()
    }

    fun showDemo() {
        if (operation?.isActive == true) return
        val activeRepository = repository ?: return
        operation = viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { activeRepository.enableDemo() }
            }.onSuccess { snapshot ->
                applySnapshot(
                    snapshot = snapshot,
                    phase = SyncPhase.DEMO,
                    paired = false,
                    feedback = UserFeedback(
                        "Demo sample loaded on this device only.",
                        isError = false,
                    ),
                )
                updateWidgets()
            }.onFailure(::showFailure)
        }
    }

    fun clearDemo() {
        if (operation?.isActive == true) return
        val activeRepository = repository ?: return
        operation = viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { activeRepository.disableDemo() }
            }.onSuccess {
                mutableState.value = StatuslineUiState(
                    endpoint = activeRepository.endpoint,
                    feedback = UserFeedback("Demo sample removed.", isError = false),
                )
                updateWidgets()
            }.onFailure(::showFailure)
        }
    }

    fun disconnect() {
        if (operation?.isActive == true) return
        val activeRepository = repository ?: return
        if (activeRepository.resetNotificationsEnabled()) {
            activeRepository.beginResetNotificationRemoval()
            if (StatuslineApplication.isPushConfigured()) {
                FirebaseMessaging.getInstance().isAutoInitEnabled = false
            }
        }
        operation = viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    disableFirebasePushRegistration()
                    activeRepository.disconnect()
                }
            }.onSuccess {
                withContext(Dispatchers.IO) {
                    disableFirebasePushRegistration()
                }
                mutableState.value = StatuslineUiState(
                    endpoint = activeRepository.endpoint,
                    feedback = UserFeedback(
                        "This device was disconnected from the relay.",
                        isError = false,
                    ),
                )
                updateWidgets()
            }.onFailure {
                withContext(Dispatchers.IO) {
                    disableFirebasePushRegistration()
                }
                mutableState.value = mutableState.value.copy(
                    isPaired = activeRepository.isPaired(),
                    resetNotificationsEnabled = activeRepository.resetNotificationsEnabled(),
                    resetNotificationsBusy = false,
                    feedback = UserFeedback(
                        "Could not unregister this device. Check your connection before disconnecting.",
                        isError = true,
                    ),
                )
            }
        }
    }

    fun scannerUnavailable(message: String? = null) {
        mutableState.value = mutableState.value.copy(
            feedback = UserFeedback(
                message ?: "Could not open the scanner. You can paste the link manually.",
                isError = true,
            ),
        )
    }

    fun externalPageUnavailable() {
        mutableState.value = mutableState.value.copy(
            feedback = UserFeedback(
                "Could not open the browser on this device.",
                isError = true,
            ),
        )
    }

    fun clearFeedback() {
        mutableState.value = mutableState.value.copy(feedback = null)
    }

    private fun applySnapshot(
        snapshot: AgentServicesSnapshot?,
        phase: SyncPhase,
        paired: Boolean,
        feedback: UserFeedback?,
    ) {
        val activeRepository = repository
        val focus = activeRepository?.focusedProviderId()
        val status = snapshot?.focusedProvider(focus)?.usageStatus(snapshot.isDemo)
        mutableState.value = mutableState.value.copy(
            inventory = snapshot,
            focusId = focus,
            status = status,
            phase = phase,
            isPaired = paired,
            feedback = feedback,
        )
    }

    private fun showFailure(error: Throwable) {
        val failure = error as? StatuslineException
        mutableState.value = mutableState.value.copy(
            phase = if (failure?.kind == FailureKind.NOT_PAIRED) {
                if (mutableState.value.isDemo) SyncPhase.DEMO else SyncPhase.UNPAIRED
            } else {
                SyncPhase.ERROR
            },
            isPaired = if (failure?.kind == FailureKind.NOT_PAIRED) false else mutableState.value.isPaired,
            feedback = UserFeedback(failureMessage(failure?.kind), isError = true),
        )
    }

    private fun updateWidgets() {
        StatuslineWidgetProvider.updateAll(getApplication())
    }

    private fun disableFirebasePushRegistration() {
        if (!StatuslineApplication.isPushConfigured()) return
        val messaging = FirebaseMessaging.getInstance()
        messaging.isAutoInitEnabled = false
        runCatching { Tasks.await(messaging.unregister(), 30, TimeUnit.SECONDS) }
        runCatching { Tasks.await(FirebaseInstallations.getInstance().delete(), 30, TimeUnit.SECONDS) }
    }

    private fun failureMessage(kind: FailureKind?): String = when (kind) {
        FailureKind.INVALID_CONFIGURATION -> "This build does not have a relay endpoint configured yet."
        FailureKind.INVALID_PAIRING -> "The pairing QR or link is invalid."
        FailureKind.INVALID_RESPONSE -> "The relay returned an unexpected response."
        FailureKind.INVALID_SNAPSHOT -> "The received snapshot has an invalid format."
        FailureKind.SECURE_STORAGE -> "Could not access this device’s secure storage."
        FailureKind.ENDPOINT_MISMATCH -> "The pairing belongs to a different Statusline relay."
        FailureKind.NETWORK -> "Could not connect to the relay. Check your connection and try again."
        FailureKind.TIMEOUT -> "The relay took too long to respond."
        FailureKind.NOT_PAIRED -> "Pair this device with Statusline Companion first."
        FailureKind.CHANNEL_EXPIRED -> "The channel has expired or was disconnected. Pair this device again."
        FailureKind.RATE_LIMITED -> "Too many requests. Wait a moment before trying again."
        FailureKind.UNKNOWN, null -> "Statusline could not complete the operation. Please try again."
    }
}
