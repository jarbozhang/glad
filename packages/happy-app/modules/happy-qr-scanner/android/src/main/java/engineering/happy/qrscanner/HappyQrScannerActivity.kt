package engineering.happy.qrscanner

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer
import java.util.EnumMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class HappyQrScannerActivity : ComponentActivity() {
    private val analyzerExecutor = Executors.newSingleThreadExecutor()
    private val reader = MultiFormatReader()
    private val finished = AtomicBoolean(false)
    private var lastAnalysisAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            finishCanceled()
            return
        }

        reader.setHints(
            EnumMap<DecodeHintType, Any>(DecodeHintType::class.java).apply {
                put(DecodeHintType.POSSIBLE_FORMATS, listOf(BarcodeFormat.QR_CODE))
                put(DecodeHintType.TRY_HARDER, true)
                put(DecodeHintType.CHARACTER_SET, "UTF-8")
            }
        )

        val previewView = PreviewView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }

        val cancelButton = TextView(this).apply {
            text = "X"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setTextSize(20f)
            setBackgroundColor(0x66000000)
            setOnClickListener { finishCanceled() }
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(previewView)
            addView(
                cancelButton,
                FrameLayout.LayoutParams(
                    dp(48),
                    dp(48),
                    Gravity.TOP or Gravity.START
                ).apply {
                    topMargin = dp(40)
                    leftMargin = dp(16)
                }
            )
        }

        setContentView(root)
        startCamera(previewView)
    }

    override fun onDestroy() {
        analyzerExecutor.shutdown()
        super.onDestroy()
    }

    private fun startCamera(previewView: PreviewView) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder()
                    .build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }
                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { analysis ->
                        analysis.setAnalyzer(analyzerExecutor) { imageProxy ->
                            analyzeImage(imageProxy)
                        }
                    }

                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageAnalysis
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start QR scanner camera", e)
                finishCanceled()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun analyzeImage(image: ImageProxy) {
        try {
            if (finished.get()) {
                return
            }

            val now = System.currentTimeMillis()
            if (now - lastAnalysisAt < MIN_ANALYSIS_INTERVAL_MS) {
                return
            }
            lastAnalysisAt = now

            decodeQrCode(image)?.let { text ->
                finishWithResult(text)
            }
        } finally {
            image.close()
        }
    }

    private fun decodeQrCode(image: ImageProxy): String? {
        val yPlane = image.planes.firstOrNull() ?: return null
        val data = copyLuminancePlane(yPlane.buffer, image.width, image.height, yPlane.rowStride)
        val rotationDegrees = image.imageInfo.rotationDegrees
        val rotated = rotateLuminance(data, image.width, image.height, rotationDegrees)

        return decodeLuminance(rotated.data, rotated.width, rotated.height)
            ?: if (rotationDegrees == 0) null else decodeLuminance(data, image.width, image.height)
    }

    private fun decodeLuminance(data: ByteArray, width: Int, height: Int): String? {
        if (width <= 0 || height <= 0 || data.isEmpty()) {
            return null
        }

        return try {
            val source = PlanarYUVLuminanceSource(data, width, height, 0, 0, width, height, false)
            val bitmap = BinaryBitmap(HybridBinarizer(source))
            reader.decodeWithState(bitmap).text
        } catch (_: ReaderException) {
            null
        } finally {
            reader.reset()
        }
    }

    private fun finishWithResult(text: String) {
        if (!finished.compareAndSet(false, true)) {
            return
        }

        runOnUiThread {
            setResult(Activity.RESULT_OK, Intent().putExtra(HAPPY_QR_SCANNER_EXTRA_DATA, text))
            finish()
        }
    }

    private fun finishCanceled() {
        if (!finished.compareAndSet(false, true)) {
            return
        }

        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }

    companion object {
        private const val TAG = "HappyQrScanner"
        private const val MIN_ANALYSIS_INTERVAL_MS = 120L
    }
}

private fun copyLuminancePlane(
    buffer: java.nio.ByteBuffer,
    width: Int,
    height: Int,
    rowStride: Int
): ByteArray {
    val output = ByteArray(width * height)
    val duplicate = buffer.duplicate()

    for (row in 0 until height) {
        val rowStart = row * rowStride
        if (rowStart >= duplicate.limit()) {
            break
        }

        duplicate.position(rowStart)
        val bytesToRead = minOf(width, duplicate.remaining())
        duplicate.get(output, row * width, bytesToRead)
    }

    return output
}

private fun rotateLuminance(
    data: ByteArray,
    width: Int,
    height: Int,
    rotationDegrees: Int
): LuminanceData {
    return when ((rotationDegrees % 360 + 360) % 360) {
        90 -> {
            val output = ByteArray(data.size)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    output[x * height + (height - y - 1)] = data[y * width + x]
                }
            }
            LuminanceData(output, height, width)
        }
        180 -> {
            val output = ByteArray(data.size)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    output[(height - y - 1) * width + (width - x - 1)] = data[y * width + x]
                }
            }
            LuminanceData(output, width, height)
        }
        270 -> {
            val output = ByteArray(data.size)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    output[(width - x - 1) * height + y] = data[y * width + x]
                }
            }
            LuminanceData(output, height, width)
        }
        else -> LuminanceData(data, width, height)
    }
}

private data class LuminanceData(
    val data: ByteArray,
    val width: Int,
    val height: Int
)
