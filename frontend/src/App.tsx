import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";

type ClaimObject = "car" | "laptop" | "package";

type ClaimStatus =
  | "supported"
  | "contradicted"
  | "not_enough_information";

type Severity =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "unknown";

type AnalysisResult = {
  success?: boolean;
  evidence_standard_met: boolean;
  evidence_standard_met_reason: string;
  risk_flags: string[];
  issue_type: string;
  object_part: string;
  claim_status: ClaimStatus;
  claim_status_justification: string;
  supporting_image_ids: string[];
  valid_image: boolean;
  severity: Severity;
  claim_object?: ClaimObject;
  required_views?: string[];
  manual_review_required?: boolean;
  vision_model?: string;
};

type EvidenceImage = {
  id: string;
  file: File;
  url: string;
};

const objectOptions: {
  value: ClaimObject;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    value: "car",
    label: "Car",
    icon: "🚗",
    description: "Vehicle damage",
  },
  {
    value: "laptop",
    label: "Laptop",
    icon: "💻",
    description: "Computer damage",
  },
  {
    value: "package",
    label: "Package",
    icon: "📦",
    description: "Packaging damage",
  },
];

const sampleClaims: Record<ClaimObject, string> = {
  car: `Customer: My car front bumper is damaged.
Support: Which part should we review?
Customer: The front bumper. It has a deep scratch.
Support: Is this only the bumper?
Customer: Yes, only the front bumper.`,

  laptop: `Customer: My laptop screen is cracked.
Support: Are you claiming screen damage only?
Customer: Yes, the screen has a visible crack.
Support: Is the keyboard or hinge damaged too?
Customer: No, only the screen.`,

  package: `Customer: My package was crushed during delivery.
Support: Are you claiming packaging damage?
Customer: Yes, the cardboard box corner is crushed.
Support: Is the product inside damaged?
Customer: No, only the package.`,
};

const styles = `
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  background: #f5f7fb;
  color: #172033;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

.app {
  min-height: 100vh;
}

.topbar {
  height: 70px;
  background: #ffffff;
  border-bottom: 1px solid #e7eaf0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 34px;
  position: sticky;
  top: 0;
  z-index: 20;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #4f46e5;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
}

.brand-title {
  font-size: 18px;
  font-weight: 800;
}

.brand-subtitle {
  color: #7b8498;
  font-size: 12px;
  margin-top: 2px;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 13px;
  border: 1px solid #e3e7ef;
  border-radius: 999px;
  color: #59647a;
  background: #fafbfc;
  font-size: 13px;
  font-weight: 600;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}

.page {
  max-width: 1420px;
  margin: 0 auto;
  padding: 30px;
}

.hero {
  margin-bottom: 26px;
}

.hero h1 {
  margin: 0;
  font-size: 30px;
  letter-spacing: -0.8px;
}

.hero p {
  margin: 8px 0 0;
  color: #68748a;
  max-width: 760px;
  line-height: 1.55;
}

.layout {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    minmax(370px, 430px);
  gap: 24px;
  align-items: start;
}

.card {
  background: #ffffff;
  border: 1px solid #e6e9f0;
  border-radius: 18px;
  box-shadow:
    0 5px 20px rgba(25, 35, 60, 0.04);
}

.card-header {
  padding: 22px 24px 16px;
  border-bottom: 1px solid #edf0f5;
}

.card-title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
}

.card-description {
  margin: 6px 0 0;
  color: #7a8497;
  font-size: 13px;
  line-height: 1.5;
}

.card-body {
  padding: 22px 24px 24px;
}

.section {
  margin-bottom: 25px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-label strong {
  font-size: 13px;
}

.section-label span {
  color: #8992a4;
  font-size: 12px;
}

.object-grid {
  display: grid;
  grid-template-columns:
    repeat(3, 1fr);
  gap: 10px;
}

.object-button {
  border: 1px solid #e2e6ef;
  background: #ffffff;
  border-radius: 13px;
  padding: 14px 10px;
  text-align: center;
  transition: 0.18s;
}

.object-button:hover:not(:disabled) {
  border-color: #b9b8f6;
  transform: translateY(-1px);
}

.object-button.active {
  border-color: #4f46e5;
  background: #f5f4ff;
  box-shadow:
    inset 0 0 0 1px #4f46e5;
}

.object-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.object-icon {
  font-size: 26px;
  display: block;
  margin-bottom: 7px;
}

.object-name {
  display: block;
  font-weight: 750;
  font-size: 13px;
}

.object-desc {
  display: block;
  color: #8a93a5;
  font-size: 11px;
  margin-top: 3px;
}

.textarea {
  width: 100%;
  min-height: 170px;
  resize: vertical;
  border: 1px solid #dfe4ed;
  border-radius: 13px;
  padding: 14px;
  outline: none;
  color: #273148;
  background: #fbfcfe;
  line-height: 1.55;
}

.textarea:focus {
  border-color: #7069e8;
  box-shadow:
    0 0 0 3px rgba(79, 70, 229, 0.08);
  background: #fff;
}

.textarea:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.upload {
  border: 1.5px dashed #cbd1de;
  background: #fafbfe;
  border-radius: 15px;
  padding: 25px 18px;
  text-align: center;
  transition: 0.18s;
}

.upload.dragging {
  border-color: #4f46e5;
  background: #f3f2ff;
}

.upload.disabled {
  opacity: 0.65;
}

.upload-icon {
  font-size: 30px;
  margin-bottom: 7px;
}

.upload-title {
  font-weight: 750;
  font-size: 14px;
}

.upload-text {
  color: #858ea0;
  font-size: 12px;
  margin: 5px 0 14px;
}

.browse-button {
  border: 1px solid #d9deea;
  background: white;
  color: #374151;
  border-radius: 9px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 700;
}

.browse-button:hover:not(:disabled) {
  border-color: #4f46e5;
  color: #4f46e5;
}

.browse-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.image-grid {
  display: grid;
  grid-template-columns:
    repeat(3, 1fr);
  gap: 10px;
  margin-top: 13px;
}

.image-card {
  border: 1px solid #e3e7ee;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  background: #f7f8fa;
}

.image-card img {
  width: 100%;
  height: 115px;
  display: block;
  object-fit: cover;
}

.image-name {
  padding: 7px 8px;
  font-size: 11px;
  color: #68748a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remove-image {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 25px;
  height: 25px;
  border: 0;
  border-radius: 50%;
  background: rgba(20, 25, 40, 0.75);
  color: white;
  font-size: 15px;
}

.remove-image:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.analyze-button {
  width: 100%;
  border: 0;
  border-radius: 12px;
  padding: 13px 16px;
  background: #4f46e5;
  color: white;
  font-weight: 800;
  font-size: 14px;
}

.analyze-button:hover:not(:disabled) {
  background: #4338ca;
}

.analyze-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.clear-button {
  width: 100%;
  margin-top: 9px;
  border: 1px solid #e0e4ec;
  background: white;
  border-radius: 12px;
  padding: 11px;
  color: #626d80;
  font-weight: 700;
  font-size: 13px;
}

.clear-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: sticky;
  top: 92px;
}

.empty-result {
  padding: 40px 24px;
  text-align: center;
  color: #7d8799;
}

.empty-icon {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  background: #f1f2ff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 13px;
  font-size: 25px;
}

.empty-result strong {
  display: block;
  color: #394257;
  margin-bottom: 5px;
}

.result-banner {
  padding: 20px 22px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.result-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
  flex-shrink: 0;
}

.result-icon.supported {
  background: #dcfce7;
}

.result-icon.contradicted {
  background: #fee2e2;
}

.result-icon.not_enough_information {
  background: #fef3c7;
}

.result-label {
  color: #8992a4;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 800;
}

.result-status {
  margin-top: 3px;
  font-size: 20px;
  font-weight: 850;
}

.result-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.metric {
  background: #f8f9fc;
  border: 1px solid #eceff4;
  border-radius: 12px;
  padding: 13px;
}

.metric-label {
  font-size: 10px;
  color: #8992a4;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 800;
}

.metric-value {
  margin-top: 5px;
  font-size: 13px;
  font-weight: 750;
  color: #2f394d;
  text-transform: capitalize;
}

.reason-box {
  border: 1px solid #e7eaf0;
  border-radius: 13px;
  padding: 14px;
  background: #fbfcfe;
}

.reason-title {
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 7px;
}

.reason-text {
  color: #68748a;
  font-size: 12px;
  line-height: 1.55;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 5px 8px;
  border-radius: 7px;
  background: #f0f1ff;
  color: #5149c7;
  font-size: 10px;
  font-weight: 750;
}

.tag.warning {
  background: #fff4d6;
  color: #9a6a00;
}

.tag.green {
  background: #dcfce7;
  color: #16733b;
}

.tag.red {
  background: #fee2e2;
  color: #a53030;
}

.footer-note {
  color: #929aaa;
  text-align: center;
  font-size: 11px;
  padding: 18px 0 5px;
}

.loading {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255,255,255,.45);
  border-top-color: white;
  border-radius: 50%;
  animation: spin .7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1000px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .right-column {
    position: static;
  }
}

@media (max-width: 600px) {
  .topbar {
    padding: 0 16px;
  }

  .page {
    padding: 20px 14px;
  }

  .object-grid {
    grid-template-columns: 1fr;
  }

  .image-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .hero h1 {
    font-size: 25px;
  }
}
`;

function App() {
  const [claimObject, setClaimObject] =
    useState<ClaimObject>("car");

  const [claimText, setClaimText] =
    useState(sampleClaims.car);

  const [images, setImages] =
    useState<EvidenceImage[]>([]);

  const [dragging, setDragging] =
    useState(false);

  const [analyzing, setAnalyzing] =
    useState(false);

  const [result, setResult] =
    useState<AnalysisResult | null>(null);

  const inputRef =
    useRef<HTMLInputElement | null>(null);

  /*
   * IMPORTANT:
   * This prevents two requests from
   * being sent at the same time.
   */
  const analyzingRef =
    useRef(false);

  const imageCountText = useMemo(() => {
    if (images.length === 0) {
      return "No images selected";
    }

    return `${images.length} image${
      images.length === 1 ? "" : "s"
    } selected`;
  }, [images.length]);

  const addFiles = (
    files: FileList | File[]
  ) => {
    if (analyzingRef.current) {
      return;
    }

    const incoming =
      Array.from(files).filter(
        (file) =>
          file.type.startsWith("image/")
      );

    if (incoming.length === 0) {
      alert(
        "Please select image files only."
      );
      return;
    }

    const remainingSlots =
      10 - images.length;

    if (remainingSlots <= 0) {
      alert(
        "Maximum 10 images allowed."
      );
      return;
    }

    const selectedFiles =
      incoming.slice(
        0,
        remainingSlots
      );

    const newImages: EvidenceImage[] =
      selectedFiles.map(
        (file, index) => ({
          id: `img_${
            images.length +
            index +
            1
          }`,
          file,
          url:
            URL.createObjectURL(
              file
            ),
        })
      );

    setImages((current) => [
      ...current,
      ...newImages,
    ]);

    setResult(null);
  };

  const handleFileChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    if (event.target.files) {
      addFiles(
        event.target.files
      );
    }

    event.target.value = "";
  };

  const handleDrop = (
    event: DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    if (analyzingRef.current) {
      return;
    }

    setDragging(false);

    if (event.dataTransfer.files) {
      addFiles(
        event.dataTransfer.files
      );
    }
  };

  const removeImage = (
    id: string
  ) => {
    if (analyzingRef.current) {
      return;
    }

    setImages((current) => {
      const image =
        current.find(
          (item) =>
            item.id === id
        );

      if (image) {
        URL.revokeObjectURL(
          image.url
        );
      }

      return current
        .filter(
          (item) =>
            item.id !== id
        )
        .map(
          (item, index) => ({
            ...item,
            id: `img_${
              index + 1
            }`,
          })
        );
    });

    setResult(null);
  };

  const clearAll = () => {
    if (analyzingRef.current) {
      return;
    }

    images.forEach(
      (image) => {
        URL.revokeObjectURL(
          image.url
        );
      }
    );

    setImages([]);
    setClaimText(
      sampleClaims[
        claimObject
      ]
    );
    setResult(null);
  };

  const changeObject = (
    value: ClaimObject
  ) => {
    if (analyzingRef.current) {
      return;
    }

    setClaimObject(value);
    setClaimText(
      sampleClaims[value]
    );
    setResult(null);
  };

  /*
   * MAIN ANALYZE FUNCTION
   */
  const analyzeClaim =
    async () => {
      /*
       * Duplicate request protection.
       * If a request is already running,
       * do nothing.
       */
      if (
        analyzingRef.current
      ) {
        console.log(
          "Analysis already running."
        );
        return;
      }

      if (!claimText.trim()) {
        alert(
          "Please enter the claim conversation."
        );
        return;
      }

      if (images.length === 0) {
        alert(
          "Please upload at least one image."
        );
        return;
      }

      /*
       * Lock BEFORE fetch.
       */
      analyzingRef.current = true;
      setAnalyzing(true);
      setResult(null);

      const controller =
        new AbortController();

      /*
       * 5 minute timeout.
       */
      const timeoutId =
        window.setTimeout(
          () => {
            controller.abort();
          },
          5 * 60 * 1000
        );

      try {
        const formData =
          new FormData();

        formData.append(
          "claimObject",
          claimObject
        );

        formData.append(
          "claimText",
          claimText
        );

        images.forEach(
          (image) => {
            formData.append(
              "images",
              image.file
            );
          }
        );

        console.log(
          "===================================="
        );

        console.log(
          "Sending claim to backend..."
        );

        console.log(
          "Object:",
          claimObject
        );

        console.log(
          "Images:",
          images.length
        );

        console.log(
          "===================================="
        );

        /*
         * DO NOT add Content-Type manually.
         * Browser automatically creates the
         * multipart/form-data boundary.
         */
        const response =
          await fetch(
            "https://velozity-dashboard-6vuz.onrender.com/analyze",
            {
              method: "POST",
              body: formData,
              signal:
                controller.signal,
            }
          );

        /*
         * Read response as JSON.
         */
        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Analysis failed."
          );
        }

        console.log(
          "===================================="
        );

        console.log(
          "BACKEND RESULT"
        );

        console.log(data);

        console.log(
          "===================================="
        );

        setResult(data);

      } catch (error) {
        console.error(
          "Analysis error:",
          error
        );

        /*
         * Request timeout.
         */
        if (
          error instanceof
            DOMException &&
          error.name ===
            "AbortError"
        ) {
          alert(
            "Analysis took longer than 5 minutes. Try again with one image."
          );
        }

        /*
         * Backend not reachable.
         */
        else if (
          error instanceof
          TypeError
        ) {
          alert(
            "Cannot connect to the backend. Make sure the backend server is running on port 5000."
          );
        }

        /*
         * Normal backend error.
         */
        else {
          alert(
            error instanceof
              Error
              ? error.message
              : "Something went wrong."
          );
        }

      } finally {
        window.clearTimeout(
          timeoutId
        );

        /*
         * Always unlock.
         */
        analyzingRef.current =
          false;

        setAnalyzing(false);
      }
    };

  const statusLabel = (
    status: ClaimStatus
  ) => {
    if (
      status === "supported"
    ) {
      return "Supported";
    }

    if (
      status === "contradicted"
    ) {
      return "Contradicted";
    }

    return "Not enough information";
  };

  const statusIcon = (
    status: ClaimStatus
  ) => {
    if (
      status === "supported"
    ) {
      return "✓";
    }

    if (
      status === "contradicted"
    ) {
      return "!";
    }

    return "?";
  };

  return (
    <>
      <style>
        {styles}
      </style>

      <div className="app">

        <header className="topbar">

          <div className="brand">

            <div className="brand-mark">
              E
            </div>

            <div>

              <div className="brand-title">
                Evidence Review
              </div>

              <div className="brand-subtitle">
                Multi-Modal Damage Claim Verification
              </div>

            </div>

          </div>

          <div className="status-pill">

            <span className="status-dot" />

            Review workspace ready

          </div>

        </header>

        <main className="page">

          <section className="hero">

            <h1>
              Damage Claim Review
            </h1>

            <p>
              Review a customer's claim
              using the conversation,
              submitted images, object
              type, and evidence requirements.
            </p>

          </section>

          <div className="layout">

            {/* LEFT */}

            <section className="card">

              <div className="card-header">

                <h2 className="card-title">
                  Claim information
                </h2>

                <p className="card-description">
                  Provide the claim details
                  and visual evidence that
                  should be reviewed.
                </p>

              </div>

              <div className="card-body">

                {/* OBJECT */}

                <div className="section">

                  <div className="section-label">

                    <strong>
                      1. Claim object
                    </strong>

                    <span>
                      Required
                    </span>

                  </div>

                  <div className="object-grid">

                    {objectOptions.map(
                      (option) => (

                        <button
                          key={
                            option.value
                          }
                          type="button"
                          className={`object-button ${
                            claimObject ===
                            option.value
                              ? "active"
                              : ""
                          }`}
                          disabled={
                            analyzing
                          }
                          onClick={() =>
                            changeObject(
                              option.value
                            )
                          }
                        >

                          <span className="object-icon">
                            {option.icon}
                          </span>

                          <span className="object-name">
                            {option.label}
                          </span>

                          <span className="object-desc">
                            {
                              option.description
                            }
                          </span>

                        </button>

                      )
                    )}

                  </div>

                </div>

                {/* CONVERSATION */}

                <div className="section">

                  <div className="section-label">

                    <strong>
                      2. Claim conversation
                    </strong>

                    <span>
                      {
                        claimText.length
                      }{" "}
                      characters
                    </span>

                  </div>

                  <textarea
                    className="textarea"
                    value={
                      claimText
                    }
                    disabled={
                      analyzing
                    }
                    onChange={(
                      event
                    ) =>
                      setClaimText(
                        event.target
                          .value
                      )
                    }
                    placeholder="Paste the customer/support conversation here..."
                  />

                </div>

                {/* IMAGES */}

                <div className="section">

                  <div className="section-label">

                    <strong>
                      3. Evidence images
                    </strong>

                    <span>
                      {
                        imageCountText
                      }
                    </span>

                  </div>

                  <div
                    className={`upload ${
                      dragging
                        ? "dragging"
                        : ""
                    } ${
                      analyzing
                        ? "disabled"
                        : ""
                    }`}
                    onDragOver={(
                      event
                    ) => {

                      event.preventDefault();

                      if (
                        !analyzing
                      ) {
                        setDragging(
                          true
                        );
                      }

                    }}
                    onDragLeave={() =>
                      setDragging(
                        false
                      )
                    }
                    onDrop={
                      handleDrop
                    }
                  >

                    <div className="upload-icon">
                      🖼️
                    </div>

                    <div className="upload-title">
                      Drag & drop evidence images
                    </div>

                    <div className="upload-text">
                      JPG, PNG, WEBP or other image files
                    </div>

                    <button
                      type="button"
                      className="browse-button"
                      disabled={
                        analyzing
                      }
                      onClick={() =>
                        inputRef.current?.click()
                      }
                    >
                      Browse images
                    </button>

                    <input
                      ref={
                        inputRef
                      }
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      disabled={
                        analyzing
                      }
                      onChange={
                        handleFileChange
                      }
                    />

                  </div>

                  {images.length >
                    0 && (

                    <div className="image-grid">

                      {images.map(
                        (image) => (

                          <div
                            className="image-card"
                            key={
                              image.id
                            }
                          >

                            <img
                              src={
                                image.url
                              }
                              alt={
                                image.id
                              }
                            />

                            <button
                              type="button"
                              className="remove-image"
                              disabled={
                                analyzing
                              }
                              onClick={() =>
                                removeImage(
                                  image.id
                                )
                              }
                              title="Remove image"
                            >
                              ×
                            </button>

                            <div className="image-name">
                              {
                                image.id
                              }{" "}
                              ·{" "}
                              {
                                image
                                  .file
                                  .name
                              }
                            </div>

                          </div>

                        )
                      )}

                    </div>

                  )}

                </div>

                {/* ACTIONS */}

                <div className="section">

                  <button
                    type="button"
                    className="analyze-button"
                    disabled={
                      analyzing ||
                      images.length ===
                        0 ||
                      !claimText.trim()
                    }
                    onClick={
                      analyzeClaim
                    }
                  >

                    {analyzing ? (

                      <span className="loading">

                        <span className="spinner" />

                        Reviewing evidence...

                      </span>

                    ) : (
                      "Analyze claim"
                    )}

                  </button>

                  <button
                    type="button"
                    className="clear-button"
                    disabled={
                      analyzing
                    }
                    onClick={
                      clearAll
                    }
                  >
                    Clear review
                  </button>

                </div>

              </div>

            </section>

            {/* RIGHT */}

            <aside className="right-column">

              {/* RESULT CARD */}

              <section className="card">

                <div className="card-header">

                  <h2 className="card-title">
                    Evidence decision
                  </h2>

                  <p className="card-description">
                    The final review result
                    and evidence signals
                    will appear here.
                  </p>

                </div>

                {!result ? (

                  <div className="empty-result">

                    <div className="empty-icon">
                      🔍
                    </div>

                    <strong>
                      {analyzing
                        ? "Review in progress"
                        : "No review yet"}
                    </strong>

                    <span>
                      {analyzing
                        ? "The local vision model is analyzing the submitted evidence."
                        : 'Upload evidence and click "Analyze claim".'}
                    </span>

                  </div>

                ) : (

                  <div className="card-body">

                    {/* STATUS */}

                    <div className="result-banner">

                      <div
                        className={`result-icon ${
                          result.claim_status
                        }`}
                      >
                        {
                          statusIcon(
                            result.claim_status
                          )
                        }
                      </div>

                      <div>

                        <div className="result-label">
                          Claim status
                        </div>

                        <div className="result-status">
                          {
                            statusLabel(
                              result.claim_status
                            )
                          }
                        </div>

                      </div>

                    </div>

                    <div
                      style={{
                        height: 18,
                      }}
                    />

                    {/* METRICS */}

                    <div className="result-grid">

                      <div className="metric">

                        <div className="metric-label">
                          Object
                        </div>

                        <div className="metric-value">
                          {
                            result.claim_object ||
                            claimObject
                          }
                        </div>

                      </div>

                      <div className="metric">

                        <div className="metric-label">
                          Severity
                        </div>

                        <div className="metric-value">
                          {
                            result.severity
                          }
                        </div>

                      </div>

                      <div className="metric">

                        <div className="metric-label">
                          Issue
                        </div>

                        <div className="metric-value">
                          {
                            result.issue_type
                          }
                        </div>

                      </div>

                      <div className="metric">

                        <div className="metric-label">
                          Object part
                        </div>

                        <div className="metric-value">
                          {
                            result.object_part
                          }
                        </div>

                      </div>

                    </div>

                    <div
                      style={{
                        height: 14,
                      }}
                    />

                    {/* EVIDENCE */}

                    <div className="reason-box">

                      <div className="reason-title">
                        Evidence standard
                      </div>

                      <div
                        className="tags"
                        style={{
                          marginBottom: 9,
                        }}
                      >

                        <span
                          className={`tag ${
                            result.evidence_standard_met
                              ? "green"
                              : "warning"
                          }`}
                        >
                          {
                            result.evidence_standard_met
                              ? "MET"
                              : "NOT MET"
                          }
                        </span>

                        <span
                          className={`tag ${
                            result.valid_image
                              ? "green"
                              : "red"
                          }`}
                        >
                          {
                            result.valid_image
                              ? "Images usable"
                              : "Images invalid"
                          }
                        </span>

                      </div>

                      <div className="reason-text">
                        {
                          result.evidence_standard_met_reason
                        }
                      </div>

                    </div>

                    <div
                      style={{
                        height: 12,
                      }}
                    />

                    {/* JUSTIFICATION */}

                    <div className="reason-box">

                      <div className="reason-title">
                        Review justification
                      </div>

                      <div className="reason-text">
                        {
                          result.claim_status_justification
                        }
                      </div>

                    </div>

                    <div
                      style={{
                        height: 12,
                      }}
                    />

                    {/* RISK FLAGS */}

                    <div className="reason-box">

                      <div className="reason-title">
                        Risk flags
                      </div>

                      <div className="tags">

                        {result.risk_flags &&
                        result.risk_flags.length >
                          0 ? (

                          result.risk_flags.map(
                            (flag) => (

                              <span
                                className="tag warning"
                                key={flag}
                              >
                                {
                                  flag
                                }
                              </span>

                            )
                          )

                        ) : (

                          <span className="tag green">
                            none
                          </span>

                        )}

                      </div>

                    </div>

                    <div
                      style={{
                        height: 12,
                      }}
                    />

                    {/* SUPPORTING IMAGES */}

                    <div className="reason-box">

                      <div className="reason-title">
                        Supporting image IDs
                      </div>

                      <div className="tags">

                        {result.supporting_image_ids &&
                        result
                          .supporting_image_ids
                          .length >
                          0 ? (

                          result.supporting_image_ids.map(
                            (id) => (

                              <span
                                className="tag green"
                                key={id}
                              >
                                {id}
                              </span>

                            )
                          )

                        ) : (

                          <span className="tag">
                            none
                          </span>

                        )}

                      </div>

                    </div>

                    {result.vision_model && (

                      <>
                        <div
                          style={{
                            height: 12,
                          }}
                        />

                        <div className="reason-box">

                          <div className="reason-title">
                            Vision model
                          </div>

                          <div className="reason-text">
                            {
                              result.vision_model
                            }
                          </div>

                        </div>
                      </>

                    )}

                  </div>

                )}

              </section>

              {/* CHECKLIST */}

              <section className="card">

                <div className="card-header">

                  <h2 className="card-title">
                    Review checklist
                  </h2>

                  <p className="card-description">
                    The review engine should
                    consider all of these signals.
                  </p>

                </div>

                <div className="card-body">

                  <ChecklistItem
                    title="Claim conversation"
                    description="Extract the actual damage being claimed."
                    done={
                      claimText.trim()
                        .length > 0
                    }
                  />

                  <ChecklistItem
                    title="Visual evidence"
                    description="Use submitted images as the primary source of truth."
                    done={
                      images.length >
                      0
                    }
                  />

                  <ChecklistItem
                    title="Object match"
                    description="Verify that the image shows the claimed object."
                    done={
                      result !== null &&
                      result.valid_image
                    }
                  />

                  <ChecklistItem
                    title="Damage visibility"
                    description="Check whether the claimed damage is actually visible."
                    done={
                      result !== null &&
                      result.claim_status !==
                        "not_enough_information"
                    }
                  />

                  <ChecklistItem
                    title="Evidence requirements"
                    description="Check minimum evidence for the object and issue."
                    done={
                      result !== null &&
                      result.evidence_standard_met
                    }
                  />

                  <ChecklistItem
                    title="Risk signals"
                    description="Flag mismatch, authenticity and history risks."
                    done={
                      result !== null
                    }
                  />

                </div>

              </section>

            </aside>

          </div>

          <div className="footer-note">
            Multi-Modal Evidence Review ·
            Car · Laptop · Package
          </div>

        </main>

      </div>
    </>
  );
}

function ChecklistItem({
  title,
  description,
  done,
}: {
  title: string;
  description: string;
  done: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 11,
        marginBottom: 15,
      }}
    >

      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          flexShrink: 0,
          background: done
            ? "#dcfce7"
            : "#f1f3f7",
          color: done
            ? "#16803d"
            : "#9aa2b1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {done ? "✓" : "•"}
      </div>

      <div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#354056",
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: 11,
            color: "#8992a4",
            lineHeight: 1.45,
            marginTop: 2,
          }}
        >
          {description}
        </div>

      </div>

    </div>
  );
}

export default App;