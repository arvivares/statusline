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
                    "Pega primero el vínculo que muestra Statusline Companion.",
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
                        "Dispositivo conectado de forma cifrada.",
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
                        UserFeedback("Snapshot cifrado actualizado.", isError = false)
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
                        "Muestra de demostración cargada sólo en este dispositivo.",
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
                        "Muestra de demostración eliminada.",
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
                        "Este dispositivo se desconectó del relay.",
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
                message ?: "No se pudo abrir el escáner. " +
                    "Puedes pegar el vínculo manualmente.",
                isError = true,
            ),
        )
    }

    fun externalPageUnavailable() {
        mutableState.value = mutableState.value.copy(
            feedback = UserFeedback(
                "No se pudo abrir el navegador en este dispositivo.",
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
                failure?.message ?: "Statusline no pudo completar la operación.",
                isError = true,
            ),
        )
    }

    private fun updateWidgets() {
        StatuslineWidgetProvider.updateAll(getApplication())
    }
}
