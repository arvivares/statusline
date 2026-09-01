package inmerzion.statusline.protocol

data class RelayPairing(
    val channelId: String,
    val pairingToken: String,
    val encryptionKey: ByteArray,
) {
    override fun equals(other: Any?): Boolean =
        other is RelayPairing &&
            channelId == other.channelId &&
            pairingToken == other.pairingToken &&
            encryptionKey.contentEquals(other.encryptionKey)

    override fun hashCode(): Int =
        31 * (31 * channelId.hashCode() + pairingToken.hashCode()) +
            encryptionKey.contentHashCode()
}

data class ReaderCredentials(
    val protocolVersion: Int,
    val relayOrigin: String,
    val channelId: String,
    val readerToken: String,
    val encryptionKey: ByteArray,
) {
    override fun equals(other: Any?): Boolean =
        other is ReaderCredentials &&
            protocolVersion == other.protocolVersion &&
            relayOrigin == other.relayOrigin &&
            channelId == other.channelId &&
            readerToken == other.readerToken &&
            encryptionKey.contentEquals(other.encryptionKey)

    override fun hashCode(): Int {
        var result = protocolVersion
        result = 31 * result + relayOrigin.hashCode()
        result = 31 * result + channelId.hashCode()
        result = 31 * result + readerToken.hashCode()
        return 31 * result + encryptionKey.contentHashCode()
    }
}

data class RelayEnvelope(
    val protocolVersion: Int,
    val sequence: Long,
    val nonce: String,
    val ciphertext: String,
)

data class UsageStatus(
    val remainingPercentage: Int,
    val resetAtEpochSeconds: Long,
    val updatedAtEpochSeconds: Long,
    val isDemo: Boolean = false,
)

enum class FailureKind {
    INVALID_CONFIGURATION,
    INVALID_PAIRING,
    INVALID_RESPONSE,
    INVALID_SNAPSHOT,
    SECURE_STORAGE,
    ENDPOINT_MISMATCH,
    NETWORK,
    TIMEOUT,
    NOT_PAIRED,
    CHANNEL_EXPIRED,
    RATE_LIMITED,
    UNKNOWN,
}

class StatuslineException(
    val kind: FailureKind,
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)
