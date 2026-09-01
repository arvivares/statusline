package inmerzion.statusline

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import inmerzion.statusline.ui.StatuslineApp

class MainActivity : ComponentActivity() {
    private val viewModel by viewModels<StatuslineViewModel>()
    private var firstResume = true
    private val scannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        when (result.resultCode) {
            Activity.RESULT_OK -> {
                result.data
                    ?.getStringExtra(QrScannerActivity.EXTRA_QR_VALUE)
                    ?.let(viewModel::pair)
                    ?: viewModel.scannerUnavailable()
            }
            QrScannerActivity.RESULT_SCANNER_ERROR -> {
                viewModel.scannerUnavailable(
                    result.data?.getStringExtra(QrScannerActivity.EXTRA_ERROR_MESSAGE),
                )
            }
        }
    }
    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            launchScanner()
        } else {
            viewModel.scannerUnavailable(
                "Statusline necesita permiso de cámara para escanear el QR. " +
                    "También puedes pegar el vínculo manualmente.",
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val initialPairing = consumePairingUri(intent)
        setContent {
            StatuslineApp(
                viewModel = viewModel,
                onScanPairing = ::scanPairingCode,
                onOpenPrivacy = { openPublicPage("privacy") },
                onOpenSupport = { openPublicPage("support") },
            )
        }
        viewModel.initialize(initialPairing)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumePairingUri(intent)?.let(viewModel::pair)
    }

    override fun onResume() {
        super.onResume()
        if (firstResume) {
            firstResume = false
        } else {
            viewModel.refreshIfPaired()
        }
    }

    private fun scanPairingCode() {
        if (!packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            viewModel.scannerUnavailable(
                "Este dispositivo no tiene una cámara disponible. " +
                    "Puedes pegar el vínculo manualmente.",
            )
            return
        }

        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchScanner()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun launchScanner() {
        scannerLauncher.launch(Intent(this, QrScannerActivity::class.java))
    }

    private fun openPublicPage(path: String) {
        val target = Uri.parse("${BuildConfig.RELAY_BASE_URL.trimEnd('/')}/$path")
        try {
            startActivity(Intent(Intent.ACTION_VIEW, target))
        } catch (_: ActivityNotFoundException) {
            viewModel.externalPageUnavailable()
        }
    }

    private fun consumePairingUri(source: Intent?): String? {
        val value = source?.dataString?.takeIf { it.startsWith("statusline://pair?") }
        source?.data = null
        return value
    }
}
