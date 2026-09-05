package inmerzion.statusline

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import inmerzion.statusline.data.StatuslineRepository
import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.StatuslineException
import inmerzion.statusline.protocol.UsageStatus
import inmerzion.statusline.widget.StatuslineWidgetProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
    val status: UsageStatus? = null,
    val phase: SyncPhase = SyncPhase.UNPAIRED,
    val endpoint: String? = null,
    val feedback: UserFeedback? = null,
    val isPaired: Boolean = false,
) {
    val isBusy: Boolean
        get() = phase == SyncPhase.PAIRING || phase == SyncPhase.SYNCING

    val isDemo: Boolean
        get() = status?.isDemo == true
}

class StatuslineViewModel(application: Application) : AndroidViewModel(application) {
    private val repositoryResult = runCatching { StatuslineRepository(application) }
    private val repository = repositoryResult.getOrNull()
    private val initialStatus = runCatching { repository?.cachedStatus() }.getOrNull()
    private val mutableState = MutableStateFlow(
        StatuslineUiState(
            status = initialStatus,
            endpoint = repository?.endpoint,
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
            }.onSuccess { status ->
                mutableState.value = mutableState.value.copy(
                    status = status,
                    isPaired = true,
                    phase = if (status == null) {
                        SyncPhase.WAITING_FOR_DESKTOP
                    } else {
                        SyncPhase.SYNCED
                    },
                    feedback = UserFeedback(
                        "Device connected with encryption.",
                        isError = false,
                    ),
                )
                updateWidgets()
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
                    phase = if (mutableState.value.isDemo) {
                        SyncPhase.DEMO
                    } else {
                        SyncPhase.UNPAIRED
                    },
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
            }.onSuccess { status ->
                mutableState.value = mutableState.value.copy(
                    status = status,
                    phase = if (status == null) {
                        SyncPhase.WAITING_FOR_DESKTOP
                    } else {
                        SyncPhase.SYNCED
                    },
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
        }
    }

    fun showDemo() {
        if (operation?.isActive == true) return
        val activeRepository = repository ?: return
        operation = viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { activeRepository.enableDemo() }
            }.onSuccess { status ->
                mutableState.value = mutableState.value.copy(
                    status = status,
                    phase = SyncPhase.DEMO,
                    feedback = UserFeedback(
                        "Demo sample loaded on this device only.",
                        isError = false,
                    ),
                    isPaired = false,
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
                mutableState.value = mutableState.value.copy(
                    status = null,
                    phase = SyncPhase.UNPAIRED,
                    feedback = UserFeedback(
                        "Demo sample removed.",
                        isError = false,
                    ),
                    isPaired = false,
                )
                updateWidgets()
            }.onFailure(::showFailure)
        }
    }

    fun disconnect() {
        if (operation?.isActive == true) return
        val activeRepository = repository ?: return
        operation = viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { activeRepository.disconnect() }
            }.onSuccess {
                mutableState.value = StatuslineUiState(
                    endpoint = activeRepository.endpoint,
                    feedback = UserFeedback(
                        "This device was disconnected from the relay.",
                        isError = false,
                    ),
                )
                updateWidgets()
            }.onFailure(::showFailure)
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

    private fun showFailure(error: Throwable) {
        val failure = error as? StatuslineException
        mutableState.value = mutableState.value.copy(
            phase = if (failure?.kind == FailureKind.NOT_PAIRED) {
                if (mutableState.value.isDemo) SyncPhase.DEMO else SyncPhase.UNPAIRED
            } else {
                SyncPhase.ERROR
            },
            isPaired = if (failure?.kind == FailureKind.NOT_PAIRED) {
                false
            } else {
                mutableState.value.isPaired
            },
            feedback = UserFeedback(
                failureMessage(failure?.kind),
                isError = true,
            ),
        )
    }

    private fun updateWidgets() {
        StatuslineWidgetProvider.updateAll(getApplication())
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
