package inmerzion.statusline.protocol

object Base64Url {
    private const val ALPHABET =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    private val reverse = IntArray(128) { -1 }.apply {
        ALPHABET.forEachIndexed { index, character ->
            this[character.code] = index
        }
    }

    fun encode(bytes: ByteArray): String {
        if (bytes.isEmpty()) return ""

        val output = StringBuilder((bytes.size * 8 + 5) / 6)
        var accumulator = 0
        var bitCount = 0

        bytes.forEach { byte ->
            accumulator = (accumulator shl 8) or (byte.toInt() and 0xff)
            bitCount += 8
            while (bitCount >= 6) {
                bitCount -= 6
                output.append(ALPHABET[(accumulator shr bitCount) and 0x3f])
                accumulator = accumulator and lowBitsMask(bitCount)
            }
        }

        if (bitCount > 0) {
            output.append(ALPHABET[(accumulator shl (6 - bitCount)) and 0x3f])
        }
        return output.toString()
    }

    fun decode(value: String): ByteArray {
        require(value.length % 4 != 1) { "Invalid base64url length." }
        if (value.isEmpty()) return byteArrayOf()

        val output = ByteArray(value.length * 6 / 8)
        var outputIndex = 0
        var accumulator = 0
        var bitCount = 0

        value.forEach { character ->
            val decoded = if (character.code < reverse.size) reverse[character.code] else -1
            require(decoded >= 0) { "Invalid base64url character." }
            accumulator = (accumulator shl 6) or decoded
            bitCount += 6

            while (bitCount >= 8) {
                bitCount -= 8
                output[outputIndex++] = ((accumulator shr bitCount) and 0xff).toByte()
                accumulator = accumulator and lowBitsMask(bitCount)
            }
        }

        require(accumulator == 0) { "Non-canonical base64url value." }
        return output.copyOf(outputIndex)
    }

    private fun lowBitsMask(bitCount: Int): Int =
        if (bitCount == 0) 0 else (1 shl bitCount) - 1
}
