import * as faceapi from '@vladmandic/face-api';

let modelsLoadedPromise = null;

/**
 * Loads TinyFaceDetector, Tiny Landmarks, Expression Net, and FaceRecognitionNet from /models
 */
export async function loadFaceModels(onProgress) {
    if (modelsLoadedPromise) {
        return modelsLoadedPromise;
    }

    modelsLoadedPromise = (async () => {
        const MODEL_URL = '/models';
        if (onProgress) onProgress('Loading face detection models...');

        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        if (onProgress) onProgress('Face models loaded successfully');
        return true;
    })();

    return modelsLoadedPromise;
}

/**
 * Calculates Euclidean distance between 2 points (x, y)
 */
function dist2D(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Calculates Eye Aspect Ratio (EAR) from 6 landmark points
 * Points: [p0, p1, p2, p3, p4, p5]
 * EAR = (||p1 - p5|| + ||p2 - p4||) / (2 * ||p0 - p3||)
 */
function calculateEAR(eyePoints) {
    if (!eyePoints || eyePoints.length < 6) return 0;
    const vertical1 = dist2D(eyePoints[1], eyePoints[5]);
    const vertical2 = dist2D(eyePoints[2], eyePoints[4]);
    const horizontal = dist2D(eyePoints[0], eyePoints[3]);
    if (horizontal <= 0) return 0;
    return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Detects face, 68 landmarks (eyes), expressions, and 128-d biometric descriptor
 */
export async function detectFaceInVideo(videoElement, { inputSize = 224, scoreThreshold = 0.45 } = {}) {
    if (!videoElement || videoElement.readyState < 2) {
        return { detected: false, reason: 'VIDEO_NOT_READY' };
    }

    await loadFaceModels();

    const options = new faceapi.TinyFaceDetectorOptions({
        inputSize,
        scoreThreshold
    });

    const result = await faceapi
        .detectSingleFace(videoElement, options)
        .withFaceLandmarks(true) // use tiny landmark net
        .withFaceExpressions()
        .withFaceDescriptor();

    if (!result) {
        return { detected: false, reason: 'NO_FACE_DETECTED' };
    }

    const { detection, landmarks, expressions, descriptor } = result;

    // Extract eye points (landmarks for 68 points)
    // Left eye: index 36 to 41, Right eye: index 42 to 47
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const leftEAR = calculateEAR(leftEye);
    const rightEAR = calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;

    // Normal open eye aspect ratio is >= 0.16. Closed/squinted is < 0.14
    const eyesOpen = avgEAR >= 0.15;

    // Find dominant expression
    let dominantExpression = 'neutral';
    let maxScore = 0;
    if (expressions) {
        for (const [expr, score] of Object.entries(expressions)) {
            if (score > maxScore) {
                maxScore = score;
                dominantExpression = expr;
            }
        }
    }

    return {
        detected: true,
        score: detection.score,
        box: detection.box,
        descriptor: Array.from(descriptor), // convert Float32Array to standard array for JSON storage
        expressions,
        dominantExpression,
        dominantScore: maxScore,
        eyesOpen,
        avgEAR: Number(avgEAR.toFixed(3)),
        leftEAR: Number(leftEAR.toFixed(3)),
        rightEAR: Number(rightEAR.toFixed(3)),
        landmarksCount: landmarks.positions.length
    };
}

/**
 * Compares two 128-d face descriptors using Euclidean distance
 * Standard threshold for face-api is ~0.55. Distance <= 0.55 means same face.
 */
export function compareFaceDescriptors(referenceDescriptor, currentDescriptor, threshold = 0.55) {
    if (!referenceDescriptor || !currentDescriptor) {
        return { match: false, distance: 1.0, confidence: 0 };
    }

    if (referenceDescriptor.length !== 128 || currentDescriptor.length !== 128) {
        return { match: false, distance: 1.0, confidence: 0 };
    }

    const dist = faceapi.euclideanDistance(referenceDescriptor, currentDescriptor);
    const match = dist <= threshold;

    // Convert distance to a 0 - 100% confidence rating
    const confidence = Math.max(0, Math.min(100, Math.round((1 - (dist / 0.70)) * 100)));

    return {
        match,
        distance: Number(dist.toFixed(3)),
        confidence
    };
}

export default {
    loadFaceModels,
    detectFaceInVideo,
    compareFaceDescriptors
};
