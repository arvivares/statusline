package inmerzion.statusline.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import inmerzion.statusline.protocol.Base64Url
import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.ReaderCredentials
import inmerzion.statusline.protocol.RelayProtocol
import inmerzion.statusline.protocol.StatuslineException
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureCredentialStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun load(): ReaderCredentials? {
        val encodedNonce = preferences.getString(FIELD_NONCE, null)
        val encodedCiphertext = preferences.getString(FIELD_CIPHERTEXT, null)
        if (encodedNonce == null && encodedCiphertext == null) return null
        if (encodedNonce == null || encodedCiphertext == null) throw secureStorageFailure()

        try {
            val key = existingKey() ?: throw secureStorageFailure()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                key,
                GCMParameterSpec(128, Base64Url.decode(encodedNonce)),
            )
            cipher.updateAAD(AAD.toByteArray(StandardCharsets.UTF_8))
            val plaintext = cipher.doFinal(Base64Url.decode(encodedCiphertext))
            val body = JSONObject(String(plaintext, StandardCharsets.UTF_8))
            val encryptionKey = Base64Url.decode(body.getString("encryptionKey"))
            val credentials = ReaderCredentials(
                protocolVersion = body.getInt("protocolVersion"),
                relayOrigin = body.getString("relayOrigin"),
                channelId = body.getString("channelId"),
                readerToken = body.getString("readerToken"),
                encryptionKey = encryptionKey,
            )
            require(credentials.protocolVersion == RelayProtocol.VERSION)
            require(RelayProtocol.validateChannelId(credentials.channelId))
            require(RelayProtocol.validateReaderToken(credentials.readerToken))
            require(credentials.encryptionKey.size == 32)
            return credentials
        } catch (error: StatuslineException) {
            throw error
        } catch (error: Exception) {
            throw secureStorageFailure(error)
        }
    }

    fun save(credentials: ReaderCredentials) {
        try {
            require(credentials.protocolVersion == RelayProtocol.VERSION)
            require(RelayProtocol.validateChannelId(credentials.channelId))
            require(RelayProtocol.validateReaderToken(credentials.readerToken))
            require(credentials.encryptionKey.size == 32)

            val body = JSONObject()
                .put("protocolVersion", credentials.protocolVersion)
                .put("relayOrigin", credentials.relayOrigin)
                .put("channelId", credentials.channelId)
                .put("readerToken", credentials.readerToken)
                .put("encryptionKey", Base64Url.encode(credentials.encryptionKey))
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
            cipher.updateAAD(AAD.toByteArray(StandardCharsets.UTF_8))
            val ciphertext = cipher.doFinal(
                body.toString().toByteArray(StandardCharsets.UTF_8),
            )

            val saved = preferences.edit()
                .putString(FIELD_NONCE, Base64Url.encode(cipher.iv))
                .putString(FIELD_CIPHERTEXT, Base64Url.encode(ciphertext))
                .commit()
            if (!saved) throw secureStorageFailure()
        } catch (error: StatuslineException) {
            throw error
        } catch (error: Exception) {
            throw secureStorageFailure(error)
        }
    }

    fun clear() {
        try {
            if (!preferences.edit().clear().commit()) throw secureStorageFailure()
            val keyStore = keyStore()
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS)
            }
        } catch (error: StatuslineException) {
            throw error
        } catch (error: Exception) {
            throw secureStorageFailure(error)
        }
    }

    private fun existingKey(): SecretKey? = keyStore().getKey(KEY_ALIAS, null) as? SecretKey

    private fun getOrCreateKey(): SecretKey {
        existingKey()?.let { return it }
        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE,
        )
        val specification = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build()
        generator.init(specification)
        return generator.generateKey()
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply {
        load(null)
    }

    private fun secureStorageFailure(cause: Throwable? = null) = StatuslineException(
        FailureKind.SECURE_STORAGE,
        "No se pudo acceder al almacén seguro del dispositivo.",
        cause,
    )

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "inmerzion.statusline.relay.reader.v1"
        const val PREFERENCES = "inmerzion.statusline.secure.reader.v1"
        const val FIELD_NONCE = "nonce"
        const val FIELD_CIPHERTEXT = "ciphertext"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val AAD = "statusline.credentials.reader.v1"
    }
}
