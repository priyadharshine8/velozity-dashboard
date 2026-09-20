const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = 5000;

const OLLAMA_URL = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "qwen3-vl:4b-instruct";

// ======================================================
// BASIC MIDDLEWARE
// ======================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ======================================================
// UPLOAD FOLDER
// ======================================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ======================================================
// MULTER CONFIGURATION
// ======================================================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {

        const extension = path.extname(file.originalname);

        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1000000) +
            extension;

        cb(null, uniqueName);
    }
});

const upload = multer({

    storage: storage,

    limits: {
        files: 10,
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        if (file.mimetype && file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed."));
        }
    }
});

// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {

    res.json({
        message: "Velozity Dashboard API is running",
        status: "OK",
        vision_model: OLLAMA_MODEL
    });

});

// ======================================================
// OLLAMA HEALTH CHECK
// ======================================================

app.get("/ollama-test", async (req, res) => {

    try {

        const response = await fetch(
            `${OLLAMA_URL}/api/tags`
        );

        if (!response.ok) {

            throw new Error(
                `Ollama returned HTTP ${response.status}`
            );
        }

        const data = await response.json();

        const models = (data.models || []).map(
            model => model.name
        );

        res.json({

            connected: true,

            ollama_url: OLLAMA_URL,

            model_required: OLLAMA_MODEL,

            available_models: models,

            model_available:
                models.includes(OLLAMA_MODEL)

        });

    } catch (error) {

        console.error(
            "Ollama connection error:",
            error
        );

        res.status(500).json({

            connected: false,

            ollama_url: OLLAMA_URL,

            model_required: OLLAMA_MODEL,

            error: error.message

        });

    }

});

// ======================================================
// DATABASE TEST
// ======================================================

app.get("/db-test", async (req, res) => {

    try {

        const prisma = require("./src/prisma");

        const users = await prisma.user.findMany();

        res.json({
            connected: true,
            users
        });

    } catch (error) {

        console.error(
            "Database error:",
            error
        );

        res.status(500).json({

            connected: false,

            message:
                "Database connection failed",

            error:
                error.message

        });

    }

});

// ======================================================
// QWEN3-VL IMAGE ANALYSIS
// ======================================================

async function analyzeImageWithQwen(
    imagePath,
    claimConversation,
    objectType
) {

    try {

        console.log("Reading image:");
        console.log(imagePath);

        // --------------------------------------------------
        // VALIDATE IMAGE PATH
        // --------------------------------------------------

        if (
            typeof imagePath !== "string" ||
            imagePath.trim() === ""
        ) {

            throw new Error(
                "Image path is missing or invalid."
            );

        }

        // --------------------------------------------------
        // RESOLVE IMAGE PATH
        // --------------------------------------------------

        const resolvedImagePath =
            path.resolve(imagePath);

        console.log(
            "Resolved image path:"
        );

        console.log(
            resolvedImagePath
        );

        // --------------------------------------------------
        // CHECK IMAGE EXISTS
        // --------------------------------------------------

        if (!fs.existsSync(resolvedImagePath)) {

            throw new Error(
                `Image file does not exist: ${resolvedImagePath}`
            );

        }

        // --------------------------------------------------
        // READ IMAGE
        // --------------------------------------------------

        const imageBuffer =
            fs.readFileSync(
                resolvedImagePath
            );

        if (!imageBuffer || imageBuffer.length === 0) {

            throw new Error(
                "Image file is empty."
            );

        }

        console.log(
            `Image size: ${imageBuffer.length} bytes`
        );

        // --------------------------------------------------
        // CONVERT IMAGE TO BASE64
        // --------------------------------------------------

        const base64Image =
            imageBuffer.toString("base64");

        // --------------------------------------------------
        // PROMPT
        // --------------------------------------------------

        const prompt = `

You are an evidence-review vision model.

Analyze the uploaded image carefully for the claimed object and claimed damage.

Claimed object: ${objectType}

Claim conversation:

${claimConversation}

IMPORTANT INSTRUCTIONS:

1. First identify the main object visible in the image.

2. Compare the observed object with the claimed object.

3. Set object_match to true when the visible object belongs to the same object category as the claimed object.

4. A dark image, silhouette, partial view, distant view, or unusual lighting does NOT by itself mean object_match is false.

5. If the claimed object is "car" and the image visibly contains a car, object_match should be true.

6. Set object_match to false ONLY when the visible main object is clearly a different type of object.

7. Do NOT confuse object matching with damage visibility.

8. Only report damage that is actually visible.

9. Do not assume damage exists just because the customer claims it.

10. Carefully inspect the claimed damaged part.

11. If the claimed damaged part cannot be clearly inspected, damage_visible should be false.

12. Use "overview" when the image shows the whole object or most of the object.

13. Use "close-up" when the image focuses closely on the claimed damaged area.

14. Give a short description of exactly what can be seen.

15. Do not invent damage.

Return ONLY valid JSON.

Use exactly these fields:

{
  "object_match": true,
  "observed_object": "car",
  "damage_visible": true,
  "damage_type": "scratch",
  "damaged_part": "front bumper",
  "severity": "medium",
  "view_type": "close-up",
  "confidence": 0.95,
  "description": "A visible scratch is present on the front bumper."
}

Rules:

- object_match must be true or false.
- damage_visible must be true or false.
- confidence must be a number between 0 and 1.
- damage_type should be "none" if no damage is visible.
- damaged_part should be "unknown" if the damaged part cannot be identified.
- severity must be "low", "medium", "high", or "unknown".
- view_type must be "overview", "close-up", or "unknown".
- Do not invent damage.
- Do not include markdown.
- Do not include explanations outside the JSON.

`;

        // --------------------------------------------------
        // SEND IMAGE TO OLLAMA
        // --------------------------------------------------

        console.log(
            `Sending image to ${OLLAMA_MODEL}...`
        );

        const controller =
            new AbortController();

        const timeout =
            setTimeout(() => {

                controller.abort();

            }, 180000);

        let response;

        try {

            response = await fetch(
                `${OLLAMA_URL}/api/chat`,
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        model: OLLAMA_MODEL,

                        messages: [
                            {
                                role: "user",

                                content: prompt,

                                images: [
                                    base64Image
                                ]
                            }
                        ],

                        stream: false,

                        format: "json",

                        options: {
                            temperature: 0,
                            num_predict: 150
                        }

                    }),

                    signal:
                        controller.signal

                }
            );

        } finally {

            clearTimeout(timeout);

        }

        // --------------------------------------------------
        // HTTP ERROR
        // --------------------------------------------------

        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                `Ollama HTTP ${response.status}: ${errorText}`
            );

        }

        // --------------------------------------------------
        // READ OLLAMA RESPONSE
        // --------------------------------------------------

        const data =
            await response.json();

        if (
            !data ||
            !data.message ||
            typeof data.message.content !== "string"
        ) {

            throw new Error(
                "Ollama returned an empty response."
            );

        }

        const content =
            data.message.content.trim();

        // --------------------------------------------------
        // PRINT QWEN RESPONSE
        // --------------------------------------------------

        console.log("");

        console.log(
            "===================================="
        );

        console.log(
            "QWEN RESPONSE"
        );

        console.log(
            "===================================="
        );

        console.log(content);

        console.log(
            "===================================="
        );

        console.log("");

        return parseQwenJson(
            content,
            objectType
        );

    } catch (error) {

        console.error("");

        console.error(
            "Qwen image analysis error:"
        );

        console.error(
            error
        );

        console.error("");

        return {

            analysis_ok: false,

            object_match: null,

            observed_object: "unknown",

            damage_visible: null,

            damage_type: "unknown",

            damaged_part: "unknown",

            severity: "unknown",

            view_type: "unknown",

            confidence: 0,

            description:
                "Image analysis could not be completed.",

            analysis_error:
                error.name === "AbortError"
                    ? "Qwen image analysis timed out after 180 seconds."
                    : error.message

        };

    }

}

// ======================================================
// PARSE QWEN JSON
// ======================================================

function parseQwenJson(
    content,
    claimedObject
) {

    try {

        const parsed =
            JSON.parse(content);

        return normalizeAnalysis(
            parsed,
            claimedObject
        );

    } catch (error) {

        console.log(
            "Direct JSON parsing failed."
        );

        // --------------------------------------------------
        // TRY EXTRACTING JSON
        // --------------------------------------------------

        const match =
            content.match(/\{[\s\S]*\}/);

        if (match) {

            try {

                const parsed =
                    JSON.parse(
                        match[0]
                    );

                return normalizeAnalysis(
                    parsed,
                    claimedObject
                );

            } catch (error2) {

                console.log(
                    "Extracted JSON parsing failed."
                );

            }

        }

        return {

            analysis_ok: false,

            object_match: null,

            observed_object: "unknown",

            damage_visible: null,

            damage_type: "unknown",

            damaged_part: "unknown",

            severity: "unknown",

            view_type: "unknown",

            confidence: 0,

            description:
                "The vision model returned an invalid response.",

            analysis_error:
                "Invalid JSON returned by Qwen."

        };

    }

}

// ======================================================
// NORMALIZE MODEL RESULT
// ======================================================

function normalizeAnalysis(
    data,
    claimedObject
) {

    let observedObject =
        String(
            data.observed_object || "unknown"
        )
            .trim()
            .toLowerCase();

    let objectMatch =
        data.object_match === true;

    // --------------------------------------------------
    // SAFETY NORMALIZATION
    // --------------------------------------------------
    // If Qwen says the observed object is the same
    // category as the claimed object but incorrectly
    // returns object_match=false, use the actual
    // observed object/category comparison.
    // --------------------------------------------------

    if (
        observedObject !== "unknown" &&
        String(claimedObject).toLowerCase() ===
            observedObject
    ) {

        objectMatch = true;

    }

    let damageType =
        String(
            data.damage_type || "unknown"
        )
            .trim()
            .toLowerCase();

    let damagedPart =
        data.damaged_part ||
        "unknown";

    let severity =
        String(
            data.severity || "unknown"
        )
            .trim()
            .toLowerCase();

    let viewType =
        String(
            data.view_type || "unknown"
        )
            .trim()
            .toLowerCase();

    // --------------------------------------------------
    // VALID SEVERITY
    // --------------------------------------------------

    if (
        ![
            "low",
            "medium",
            "high",
            "unknown"
        ].includes(severity)
    ) {

        severity = "unknown";

    }

    // --------------------------------------------------
    // VALID VIEW TYPE
    // --------------------------------------------------

    if (
        ![
            "overview",
            "close-up",
            "unknown"
        ].includes(viewType)
    ) {

        viewType = "unknown";

    }

    // --------------------------------------------------
    // CONFIDENCE
    // --------------------------------------------------

    let confidence =
        typeof data.confidence === "number"
            ? data.confidence
            : 0;

    if (confidence < 0) {
        confidence = 0;
    }

    if (confidence > 1) {
        confidence = 1;
    }

    return {

        analysis_ok: true,

        object_match:
            objectMatch,

        observed_object:
            observedObject,

        damage_visible:
            data.damage_visible === true,

        damage_type:
            damageType,

        damaged_part:
            damagedPart,

        severity:
            severity,

        view_type:
            viewType,

        confidence:
            confidence,

        description:
            data.description ||
            "No description provided."

    };

}

// ======================================================
// REQUIRED VIEWS
// ======================================================

function getRequiredViews(
    claimObject
) {

    if (claimObject === "car") {

        return [
            "vehicle overview",
            "damage close-up"
        ];

    }

    if (claimObject === "laptop") {

        return [
            "laptop overview",
            "damaged area close-up"
        ];

    }

    if (claimObject === "package") {

        return [
            "package overview",
            "damage close-up"
        ];

    }

    return [];

}

// ======================================================
// CLAIMED DAMAGE TYPE
// ======================================================

function getClaimedDamageType(
    claimText
) {

    const text =
        String(claimText)
            .toLowerCase();

    if (
        text.includes("scratch") ||
        text.includes("scratched")
    ) {

        return "scratch";

    }

    if (
        text.includes("dent") ||
        text.includes("dented")
    ) {

        return "dent";

    }

    if (
        text.includes("crack") ||
        text.includes("cracked")
    ) {

        return "crack";

    }

    if (
        text.includes("broken") ||
        text.includes("break")
    ) {

        return "broken";

    }

    if (
        text.includes("damage") ||
        text.includes("damaged")
    ) {

        return "damage";

    }

    return "unknown";

}

// ======================================================
// ANALYZE CLAIM
// ======================================================

app.post(
    "/analyze",
    upload.array("images", 10),
    async (req, res) => {

        try {

            const claimObject =
                req.body.claimObject ||
                "car";

            const claimText =
                req.body.claimText ||
                "";

            const images =
                Array.isArray(req.files)
                    ? req.files
                    : [];

            // --------------------------------------------------
            // LOG CLAIM
            // --------------------------------------------------

            console.log("");

            console.log(
                "===================================="
            );

            console.log(
                "NEW CLAIM ANALYSIS"
            );

            console.log(
                "===================================="
            );

            console.log(
                "Object:",
                claimObject
            );

            console.log(
                "Claim:",
                claimText
            );

            console.log(
                "Images:",
                images.length
            );

            console.log(
                "===================================="
            );

            // --------------------------------------------------
            // VALIDATE CLAIM
            // --------------------------------------------------

            if (
                typeof claimText !== "string" ||
                !claimText.trim()
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Claim conversation is required."

                });

            }

            // --------------------------------------------------
            // VALIDATE IMAGES
            // --------------------------------------------------

            if (images.length === 0) {

                return res.status(400).json({

                    success: false,

                    error:
                        "At least one image is required."

                });

            }

            // --------------------------------------------------
            // CHECK OLLAMA
            // --------------------------------------------------

            try {

                const ollamaCheck =
                    await fetch(
                        `${OLLAMA_URL}/api/tags`
                    );

                if (!ollamaCheck.ok) {

                    throw new Error(
                        `Ollama returned HTTP ${ollamaCheck.status}`
                    );

                }

                const ollamaData =
                    await ollamaCheck.json();

                const models =
                    (ollamaData.models || [])
                        .map(
                            model =>
                                model.name
                        );

                console.log(
                    "Available Ollama models:",
                    models
                );

                if (
                    !models.includes(
                        OLLAMA_MODEL
                    )
                ) {

                    return res.status(500).json({

                        success: false,

                        error:
                            `Ollama model ${OLLAMA_MODEL} is not available.`,

                        available_models:
                            models

                    });

                }

            } catch (error) {

                console.error(
                    "Ollama health check failed:",
                    error
                );

                return res.status(500).json({

                    success: false,

                    error:
                        "Cannot connect to Ollama. Make sure Ollama is running.",

                    details:
                        error.message

                });

            }

            // ==================================================
            // ANALYZE EVERY IMAGE
            // ==================================================

            const imageResults = [];

            for (
                let i = 0;
                i < images.length;
                i++
            ) {

                const image =
                    images[i];

                console.log("");

                console.log(
                    `Analyzing image ${i + 1}/${images.length}...`
                );

                // --------------------------------------------------
                // IMPORTANT PATH CHECK
                // --------------------------------------------------

                console.log(
                    "Original name:",
                    image.originalname
                );

                console.log(
                    "MIME type:",
                    image.mimetype
                );

                console.log(
                    "Multer path:",
                    image.path
                );

                console.log(
                    "Multer destination:",
                    image.destination
                );

                console.log(
                    "Multer filename:",
                    image.filename
                );

                // --------------------------------------------------
                // BUILD SAFE IMAGE PATH
                // --------------------------------------------------

                let imagePath =
                    image.path;

                if (
                    typeof imagePath !== "string" ||
                    imagePath.trim() === ""
                ) {

                    if (
                        image.destination &&
                        image.filename
                    ) {

                        imagePath =
                            path.join(
                                image.destination,
                                image.filename
                            );

                    }

                }

                // --------------------------------------------------
                // FINAL PATH VALIDATION
                // --------------------------------------------------

                if (
                    typeof imagePath !== "string" ||
                    imagePath.trim() === ""
                ) {

                    throw new Error(
                        `Uploaded image path is undefined for ${image.originalname}`
                    );

                }

                console.log(
                    "Final image path:",
                    imagePath
                );

                // --------------------------------------------------
                // ANALYZE IMAGE
                // --------------------------------------------------

                const analysis =
                    await analyzeImageWithQwen(
                        imagePath,
                        claimText,
                        claimObject
                    );

                imageResults.push({

                    id:
                        `img_${i + 1}`,

                    original_name:
                        image.originalname,

                    filename:
                        image.filename,

                    path:
                        `/uploads/${image.filename}`,

                    size:
                        image.size,

                    mimetype:
                        image.mimetype,

                    analysis:
                        analysis

                });

            }

            // ==================================================
            // AGGREGATE RESULTS
            // ==================================================

            const requiredViews =
                getRequiredViews(
                    claimObject
                );

            const riskFlags = [];

            const supportingImageIds = [];

            // --------------------------------------------------
            // SUCCESSFUL ANALYSES
            // --------------------------------------------------

            const analyzedImages =
                imageResults.filter(
                    image =>
                        image.analysis &&
                        image.analysis.analysis_ok === true
                );

            // --------------------------------------------------
            // FAILED ANALYSES
            // --------------------------------------------------

            const failedImages =
                imageResults.filter(
                    image =>
                        !image.analysis ||
                        image.analysis.analysis_ok !== true
                );

            if (
                failedImages.length > 0
            ) {

                riskFlags.push(
                    "image_analysis_failed"
                );

            }

            // --------------------------------------------------
            // OBJECT MATCH
            // --------------------------------------------------

            const objectMatches =
                analyzedImages.filter(
                    image =>
                        image.analysis.object_match === true
                );

            const objectMismatch =
                analyzedImages.some(
                    image =>
                        image.analysis.object_match === false
                );

            if (objectMismatch) {

                riskFlags.push(
                    "object_mismatch"
                );

            }

            // --------------------------------------------------
            // DAMAGE VISIBILITY
            // --------------------------------------------------

            const damageImages =
                analyzedImages.filter(
                    image =>
                        image.analysis.damage_visible === true
                );

            const damageVisible =
                damageImages.length > 0;

            if (!damageVisible) {

                riskFlags.push(
                    "damage_not_visibly_verified"
                );

            }

            // --------------------------------------------------
            // SUPPORTING IMAGES
            // --------------------------------------------------

            damageImages.forEach(
                image => {

                    supportingImageIds.push(
                        image.id
                    );

                }
            );

            // --------------------------------------------------
            // CLAIMED DAMAGE
            // --------------------------------------------------

            const claimedDamageType =
                getClaimedDamageType(
                    claimText
                );

            // --------------------------------------------------
            // DAMAGE TYPE COMPARISON
            // --------------------------------------------------

            const differentDamage =
                damageImages.some(
                    image => {

                        const detectedDamage =
                            image.analysis.damage_type;

                        return (
                            claimedDamageType !== "unknown" &&
                            detectedDamage !== "unknown" &&
                            detectedDamage !== "none" &&
                            detectedDamage !== claimedDamageType
                        );

                    }
                );

            if (differentDamage) {

                riskFlags.push(
                    "damage_type_mismatch"
                );

            }

            // --------------------------------------------------
            // DETERMINE SEVERITY
            // --------------------------------------------------

            let severity = "unknown";

            const severityValues =
                damageImages
                    .map(
                        image =>
                            image.analysis.severity
                    )
                    .filter(
                        value =>
                            [
                                "low",
                                "medium",
                                "high"
                            ].includes(value)
                    );

            if (
                severityValues.includes("high")
            ) {

                severity = "high";

            } else if (
                severityValues.includes("medium")
            ) {

                severity = "medium";

            } else if (
                severityValues.includes("low")
            ) {

                severity = "low";

            }

            // --------------------------------------------------
            // NUMBER OF VIEWS
            // --------------------------------------------------

            if (
                images.length < 2
            ) {

                riskFlags.push(
                    "insufficient_number_of_views"
                );

            }

            // --------------------------------------------------
            // VIEW TYPES
            // --------------------------------------------------

            const viewTypes =
                analyzedImages.map(
                    image =>
                        image.analysis.view_type
                );

            const hasOverview =
                viewTypes.includes(
                    "overview"
                );

            const hasCloseup =
                viewTypes.includes(
                    "close-up"
                );

            // --------------------------------------------------
            // REQUIRED EVIDENCE
            // --------------------------------------------------

            let evidenceStandardMet =
                false;

            if (
                analyzedImages.length >= 2 &&
                objectMatches.length > 0 &&
                damageVisible &&
                hasOverview &&
                hasCloseup
            ) {

                evidenceStandardMet = true;

            }

            // --------------------------------------------------
            // MISSING VIEW
            // --------------------------------------------------

            if (
                images.length >= 2 &&
                (!hasOverview || !hasCloseup)
            ) {

                riskFlags.push(
                    "missing_required_view"
                );

            }

            // --------------------------------------------------
            // AUTHENTICITY
            // --------------------------------------------------

            riskFlags.push(
                "visual_authenticity_not_verified"
            );

            // ==================================================
            // CLAIM STATUS
            // ==================================================

            let claimStatus =
                "not_enough_information";

            let justification =
                "The submitted evidence does not contain enough visually verified information.";

            // --------------------------------------------------
            // NO SUCCESSFUL ANALYSIS
            // --------------------------------------------------

            if (
                analyzedImages.length === 0
            ) {

                claimStatus =
                    "not_enough_information";

                justification =
                    "The uploaded images could not be analyzed by the local vision model.";

            }

            // --------------------------------------------------
            // CONTRADICTED
            // --------------------------------------------------

            else if (
                objectMismatch ||
                differentDamage
            ) {

                claimStatus =
                    "contradicted";

                justification =
                    "The visual evidence conflicts with the claimed object or damage description.";

            }

            // --------------------------------------------------
            // SUPPORTED
            // --------------------------------------------------

            else if (
                evidenceStandardMet
            ) {

                claimStatus =
                    "supported";

                justification =
                    "The uploaded images visually support the claimed object and show the claimed damage. The required overview and close-up evidence were detected.";

            }

            // --------------------------------------------------
            // NOT ENOUGH INFORMATION
            // --------------------------------------------------

            else {

                claimStatus =
                    "not_enough_information";

                justification =
                    "The uploaded images provide some relevant visual evidence, but the minimum evidence requirements were not fully satisfied.";

            }

            // ==================================================
            // FINAL RESULT
            // ==================================================

            const firstDamageImage =
                damageImages.length > 0
                    ? damageImages[0]
                    : null;

            const result = {

                success: true,

                evidence_standard_met:
                    evidenceStandardMet,

                evidence_standard_met_reason:
                    evidenceStandardMet
                        ? "The required minimum visual evidence was found."
                        : "The minimum visual evidence requirements were not fully satisfied.",

                risk_flags:
                    [
                        ...new Set(riskFlags)
                    ],

                issue_type:
                    firstDamageImage
                        ? firstDamageImage.analysis.damage_type
                        : claimedDamageType,

                object_part:
                    firstDamageImage
                        ? firstDamageImage.analysis.damaged_part
                        : "unknown",

                claim_status:
                    claimStatus,

                claim_status_justification:
                    justification,

                supporting_image_ids:
                    supportingImageIds,

                valid_image:
                    objectMatches.length > 0,

                severity:
                    severity,

                claim_object:
                    claimObject,

                required_views:
                    requiredViews,

                uploaded_images:
                    imageResults,

                manual_review_required:
                    true,

                vision_model:
                    OLLAMA_MODEL

            };

            // ==================================================
            // PRINT FINAL RESULT
            // ==================================================

            console.log("");

            console.log(
                "===================================="
            );

            console.log(
                "FINAL RESULT"
            );

            console.log(
                "===================================="
            );

            console.log(
                JSON.stringify(
                    result,
                    null,
                    2
                )
            );

            console.log(
                "===================================="
            );

            // --------------------------------------------------
            // SEND RESULT TO FRONTEND
            // --------------------------------------------------

            return res.json(
                result
            );

        } catch (error) {

            console.error("");

            console.error(
                "ANALYSIS ERROR:"
            );

            console.error(
                error
            );

            console.error("");

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Analysis failed."

            });

        }

    }
);

// ======================================================
// SERVE UPLOADED IMAGES
// ======================================================

app.use(
    "/uploads",
    express.static(uploadDir)
);

// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        res.status(400).json({

            success: false,

            error:
                error.message ||
                "Server error."

        });

    }
);

// ======================================================
// START SERVER
// ======================================================

const server =
    app.listen(
        PORT,
        "127.0.0.1",
        () => {

            console.log("");

            console.log(
                "===================================="
            );

            console.log(
                " Velozity Dashboard Backend"
            );

            console.log(
                "===================================="
            );

            console.log(
                ` Server: http://127.0.0.1:${PORT}`
            );

            console.log(
                ` Analyze: http://127.0.0.1:${PORT}/analyze`
            );

            console.log(
                ` Ollama: ${OLLAMA_URL}`
            );

            console.log(
                ` Vision Model: ${OLLAMA_MODEL}`
            );

            console.log(
                "===================================="
            );

            console.log("");

            console.log(
                "Backend is RUNNING."
            );

            console.log(
                "Qwen3-VL image analysis is ENABLED."
            );

            console.log(
                "Keep this terminal open."
            );

            console.log("");

        }
    );

// ======================================================
// SERVER ERROR
// ======================================================

server.on(
    "error",
    error => {

        console.error("");

        console.error(
            "SERVER ERROR:"
        );

        if (
            error.code === "EADDRINUSE"
        ) {

            console.error(
                `Port ${PORT} is already being used.`
            );

            console.error(
                "Stop the other backend process before starting this one."
            );

        } else {

            console.error(
                error
            );

        }

        console.error("");

    }
);

// ======================================================
// KEEP PROCESS ALIVE
// ======================================================

process.stdin.resume();