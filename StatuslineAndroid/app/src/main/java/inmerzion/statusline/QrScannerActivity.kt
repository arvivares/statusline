package inmerzion.statusline

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import inmerzion.statusline.ui.DataPlaneColors
import inmerzion.statusline.ui.DataPlaneGrid
import inmerzion.statusline.ui.StatuslineTheme
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class QrScannerActivity : ComponentActivity() {
    private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val mainExecutor = Executor { command -> runOnUiThread(command) }
    private val processingFrame = AtomicBoolean(false)
    private val resultDelivered = AtomicBoolean(false)
    private val scannerHint = mutableStateOf(DEFAULT_HINT)
    private val barcodeScanner: BarcodeScanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build(),
    )
    private var cameraProvider: ProcessCameraProvider? = null
    private var consecutiveScannerFailures = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            finishWithError(
                "El permiso de cámara ya no está disponible. " +
                    "Puedes concederlo en Ajustes o pegar el vínculo manualmente.",
            )
            return
        }

        setContent {
            StatuslineTheme {
                QrScannerScreen(
                    hint = scannerHint.value,
                    onPreviewReady = ::bindCamera,
                    onClose = ::finish,
                )
            }
        }
    }

    override fun onDestroy() {
        cameraProvider?.unbindAll()
        barcodeScanner.close()
        cameraExecutor.shutdown()
        super.onDestroy()
    }

    private fun bindCamera(previewView: PreviewView) {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener(
            {
                runCatching {
                    val provider = providerFuture.get()
                    cameraProvider = provider
                    val selector = when {
                        provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) ->
                            CameraSelector.DEFAULT_BACK_CAMERA
                        provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) ->
                            CameraSelector.DEFAULT_FRONT_CAMERA
                        else -> error("No camera reported by CameraX")
                    }
                    val preview = Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also { useCase ->
                            useCase.setAnalyzer(cameraExecutor, ::analyzeFrame)
                        }

                    provider.unbindAll()
                    provider.bindToLifecycle(this, selector, preview, analysis)
                }.onFailure { error ->
                    finishWithError(
                        "No se pudo iniciar la cámara. " +
                            "Puedes pegar el vínculo manualmente.",
                        error,
                    )
                }
            },
            mainExecutor,
        )
    }

    @OptIn(ExperimentalGetImage::class)
    private fun analyzeFrame(imageProxy: ImageProxy) {
        if (!processingFrame.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            processingFrame.set(false)
            imageProxy.close()
            return
        }

        val image = InputImage.fromMediaImage(
            mediaImage,
            imageProxy.imageInfo.rotationDegrees,
        )
        barcodeScanner.process(image)
            .addOnSuccessListener { barcodes ->
                consecutiveScannerFailures = 0
                val pairingValue = barcodes
                    .asSequence()
                    .mapNotNull { it.rawValue }
                    .firstOrNull { it.startsWith(PAIRING_PREFIX) }

                if (pairingValue != null) {
                    deliverResult(pairingValue)
                } else if (barcodes.isNotEmpty()) {
                    scannerHint.value =
                        "Ese QR no pertenece a Statusline. Mantén abierto el QR del companion."
                }
            }
            .addOnFailureListener { error ->
                consecutiveScannerFailures += 1
                Log.w(TAG, "Bundled QR recognition failed", error)
                if (consecutiveScannerFailures >= MAX_SCANNER_FAILURES) {
                    finishWithError(
                        "La cámara se abrió, pero el lector QR no pudo iniciarse. " +
                            "Puedes pegar el vínculo manualmente.",
                        error,
                    )
                }
            }
            .addOnCompleteListener {
                processingFrame.set(false)
                imageProxy.close()
            }
    }

    private fun deliverResult(rawValue: String) {
        if (!resultDelivered.compareAndSet(false, true)) return
        setResult(
            Activity.RESULT_OK,
            Intent().putExtra(EXTRA_QR_VALUE, rawValue),
        )
        finish()
    }

    private fun finishWithError(message: String, error: Throwable? = null) {
        if (resultDelivered.getAndSet(true)) return
        if (error != null) Log.e(TAG, message, error)
        setResult(
            RESULT_SCANNER_ERROR,
            Intent().putExtra(EXTRA_ERROR_MESSAGE, message),
        )
        finish()
    }

    companion object {
        const val EXTRA_QR_VALUE = "inmerzion.statusline.extra.QR_VALUE"
        const val EXTRA_ERROR_MESSAGE = "inmerzion.statusline.extra.SCANNER_ERROR"
        const val RESULT_SCANNER_ERROR = Activity.RESULT_FIRST_USER

        private const val TAG = "StatuslineQrScanner"
        private const val PAIRING_PREFIX = "statusline://pair?"
        private const val MAX_SCANNER_FAILURES = 3
        private const val DEFAULT_HINT =
            "Centra el QR privado que muestra Statusline Companion."
    }
}

@Composable
private fun QrScannerScreen(
    hint: String,
    onPreviewReady: (PreviewView) -> Unit,
    onClose: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DataPlaneColors.Canvas),
    ) {
        AndroidView(
            factory = { context ->
                PreviewView(context).apply {
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    contentDescription = "Vista previa de la cámara para escanear el QR"
                    onPreviewReady(this)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.28f)),
        )
        DataPlaneGrid()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Surface(
                color = DataPlaneColors.Surface.copy(alpha = 0.94f),
                border = BorderStroke(1.dp, DataPlaneColors.Line),
                shape = RoundedCornerShape(0.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 14.dp, end = 6.dp, top = 7.dp, bottom = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "STL / PAIR SCANNER",
                            style = MaterialTheme.typography.labelSmall,
                            color = DataPlaneColors.Ink,
                        )
                        Text(
                            text = "LOCAL CAMERA · BUNDLED READER",
                            style = MaterialTheme.typography.labelSmall,
                            color = DataPlaneColors.Signal,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onClose) {
                        Text(
                            text = "CLOSE",
                            style = MaterialTheme.typography.labelLarge,
                            color = DataPlaneColors.Ink,
                        )
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(270.dp)
                        .border(
                            width = 2.dp,
                            color = DataPlaneColors.Signal,
                            shape = RoundedCornerShape(14.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .border(1.dp, DataPlaneColors.Signal),
                    )
                    Text(
                        text = "QR / PAIR",
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .background(DataPlaneColors.Signal)
                            .padding(horizontal = 9.dp, vertical = 5.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = DataPlaneColors.Canvas,
                    )
                }
            }

            Surface(
                color = DataPlaneColors.Surface.copy(alpha = 0.94f),
                border = BorderStroke(1.dp, DataPlaneColors.Line),
                shape = RoundedCornerShape(0.dp),
            ) {
                Column(
                    modifier = Modifier.padding(15.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Text(
                        text = "READER.STATE / LIVE",
                        style = MaterialTheme.typography.labelSmall,
                        color = DataPlaneColors.Signal,
                    )
                    Text(
                        text = hint,
                        style = MaterialTheme.typography.bodyMedium,
                        color = DataPlaneColors.Ink,
                    )
                    Text(
                        text = "La imagen se procesa sólo en este dispositivo.",
                        style = MaterialTheme.typography.bodySmall,
                        color = DataPlaneColors.Muted,
                    )
                }
            }
        }
    }
}
