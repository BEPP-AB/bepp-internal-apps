"use client";

import { useState, useRef, useEffect } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import { generateSignatureHtml, SignatureData } from "@/src/template";

interface SavedSignature {
  id: string;
  createdAt: number;
  html: string; // Stored HTML signature (frozen at save time)
}

// Helper function to extract name from HTML signature
const extractNameFromHtml = (html: string): string => {
  const match = html.match(/<h3[^>]*>([^<]+)<\/h3>/);
  return match ? match[1].trim() : "Signature";
};

// API utilities
const fetchSavedSignatures = async (): Promise<SavedSignature[]> => {
  try {
    const response = await fetch("/api/signatures");
    if (!response.ok) {
      throw new Error("Failed to fetch signatures");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching signatures:", error);
    return [];
  }
};

const saveSignature = async (
  signature: SignatureData,
  html: string,
): Promise<SavedSignature> => {
  const response = await fetch("/api/signatures", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html, // Only send HTML
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to save signature");
  }

  return await response.json();
};

const deleteSignature = async (id: string): Promise<void> => {
  const response = await fetch(`/api/signatures/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete signature");
  }
};

export default function Home() {
  const [formData, setFormData] = useState<SignatureData>({
    name: "",
    title: "",
    email: "",
    phone: "",
    photoUrl: "",
  });
  const [previewHtml, setPreviewHtml] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const [deletingSignatureIds, setDeletingSignatureIds] = useState<Set<string>>(new Set());
  const [currentSavedSignature, setCurrentSavedSignature] =
    useState<SavedSignature | null>(null);
  const [originalImageInfo, setOriginalImageInfo] = useState<{
    size: number;
    width: number;
    height: number;
  } | null>(null);

  const cropperRef = useRef<Cropper | null>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved signatures on mount
  useEffect(() => {
    const loadSignatures = async () => {
      setIsLoadingSignatures(true);
      try {
        const signatures = await fetchSavedSignatures();
        setSavedSignatures(signatures);
      } catch (error) {
        console.error("Error loading signatures:", error);
      } finally {
        setIsLoadingSignatures(false);
      }
    };
    loadSignatures();
  }, []);

  // Update preview when form data changes
  useEffect(() => {
    if (formData.name || formData.title || formData.email || formData.phone) {
      const html = generateSignatureHtml(formData);
      setPreviewHtml(html);
    } else {
      setPreviewHtml("");
    }
  }, [formData]);

  // Handle body overflow when modal is open
  useEffect(() => {
    if (isCropModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isCropModalOpen]);

  // Initialize cropper when modal opens
  useEffect(() => {
    if (isCropModalOpen && cropImageRef.current && cropImageSrc) {
      if (cropperRef.current) {
        cropperRef.current.destroy();
      }
      cropperRef.current = new Cropper(cropImageRef.current, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 1,
        cropBoxResizable: true,
        cropBoxMovable: true,
        guides: true,
        center: true,
        highlight: false,
        background: false,
      });
    }

    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy();
        cropperRef.current = null;
      }
    };
  }, [isCropModalOpen, cropImageSrc]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isCropModalOpen) {
        closeCropModal();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isCropModalOpen]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    // Longer timeout for detailed messages (like image optimization feedback)
    const timeout = message.length > 50 ? 10000 : 4000; // 10 seconds for detailed, 4 seconds for short
    setTimeout(() => {
      setToastVisible(false);
    }, timeout);
  };

  const autoGenerateEmail = (name: string) => {
    if (!formData.email && name) {
      const emailName = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/\s+/g, ".")
        .replace(/[^a-z.]/g, "");

      if (emailName) {
        setFormData((prev) => ({ ...prev, email: `${emailName}@bepp.se` }));
        // Clear current saved signature when email is auto-generated
        if (currentSavedSignature) {
          setCurrentSavedSignature(null);
        }
      }
    }
  };

  const handleInputChange = (field: keyof SignatureData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear current saved signature when form data changes (user is editing)
    if (currentSavedSignature) {
      setCurrentSavedSignature(null);
    }
  };

  const handleNameBlur = () => {
    autoGenerateEmail(formData.name);
  };

  const isSignatureComplete = (): boolean => {
    return (
      !!formData.name &&
      !!formData.title &&
      !!formData.email &&
      !!formData.phone &&
      !!formData.photoUrl
    );
  };

  const getMissingFields = (): string[] => {
    const missing: string[] = [];
    if (!formData.name) missing.push("name");
    if (!formData.title) missing.push("title");
    if (!formData.email) missing.push("email");
    if (!formData.phone) missing.push("phone");
    if (!formData.photoUrl) missing.push("photo");
    return missing;
  };

  const getDisabledTooltip = (): string => {
    const missing = getMissingFields();
    if (missing.length === 0) return "Save your signature";

    const fieldsList = missing
      .map((field) => {
        if (field === "photo") return "photo";
        return field;
      })
      .join(", ");

    return `Please fill in: ${fieldsList}`;
  };

  const saveCurrentSignature = async () => {
    if (!isSignatureComplete()) {
      showToast(
        "Please fill in all fields (name, title, email, phone) and upload a photo",
      );
      return;
    }

    setIsSavingSignature(true);
    try {
      // Generate the HTML signature at save time
      const html = generateSignatureHtml(formData);
      const saved = await saveSignature(formData, html);
      // Set as current saved signature so it can be copied
      setCurrentSavedSignature(saved);
      // Refresh the signatures list
      const signatures = await fetchSavedSignatures();
      setSavedSignatures(signatures);
      showToast("Signature saved! You can now copy it.");
    } catch (error) {
      console.error("Error saving signature:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to save signature",
      );
    } finally {
      setIsSavingSignature(false);
    }
  };

  // Note: loadSignature removed - signatures can only be copied, not loaded for editing

  const handleDeleteSignature = async (id: string) => {
    if (confirm("Are you sure you want to delete this signature?")) {
      setDeletingSignatureIds((prev) => new Set(prev).add(id));
      try {
        await deleteSignature(id);
        // Refresh the signatures list
        const signatures = await fetchSavedSignatures();
        setSavedSignatures(signatures);
        showToast("Signature deleted");
      } catch (error) {
        console.error("Error deleting signature:", error);
        showToast(
          error instanceof Error ? error.message : "Failed to delete signature",
        );
      } finally {
        setDeletingSignatureIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  };

  const handleCopySignature = async (signature: SavedSignature) => {
    const html = signature.html;
    try {
      await navigator.clipboard.writeText(html);
      showToast("Signature copied to clipboard!");
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = html;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showToast("Signature copied to clipboard!");
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file");
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB for initial file
    if (file.size > maxSize) {
      showToast("File size must be less than 10MB");
      return;
    }

    // Store original file size
    const originalSize = file.size;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const imageSrc = e.target.result as string;
        setCropImageSrc(imageSrc);

        // Get image dimensions
        const img = new Image();
        img.onload = () => {
          setOriginalImageInfo({
            size: originalSize,
            width: img.width,
            height: img.height,
          });
          setIsCropModalOpen(true);
        };
        img.onerror = () => {
          // If we can't get dimensions, still open modal with size info
          setOriginalImageInfo({
            size: originalSize,
            width: 0,
            height: 0,
          });
          setIsCropModalOpen(true);
        };
        img.src = imageSrc;
      }
    };
    reader.readAsDataURL(file);
  };

  const openCropModal = () => {
    fileInputRef.current?.click();
  };

  const closeCropModal = () => {
    setIsCropModalOpen(false);
    setCropImageSrc("");
    setOriginalImageInfo(null);
    if (cropperRef.current) {
      cropperRef.current.destroy();
      cropperRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadCroppedImage = async () => {
    if (!cropperRef.current) return;

    setIsUploading(true);

    try {
      const canvas = cropperRef.current.getCroppedCanvas({
        width: 280,
        height: 280,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to create blob"));
          },
          "image/jpeg",
          0.9,
        );
      });

      const formData = new FormData();
      formData.append("file", blob, "photo.jpg");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();

      setFormData((prev) => ({ ...prev, photoUrl: result.url }));
      // Clear current saved signature when photo changes
      if (currentSavedSignature) {
        setCurrentSavedSignature(null);
      }

      // Format file sizes
      const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      };

      // Create feedback message using original image info (before client-side crop)
      if (originalImageInfo && originalImageInfo.width > 0) {
        const originalSize = originalImageInfo.size;
        const finalSize = result.size;
        const sizeReduction = originalSize - finalSize;
        const sizeReductionPercent = (
          (sizeReduction / originalSize) *
          100
        ).toFixed(0);

        let feedbackMessage: string;
        if (result.optimized) {
          // Server-side optimization was applied
          feedbackMessage = `Image optimized: ${originalImageInfo.width}×${originalImageInfo.height} → ${result.processedWidth}×${result.processedHeight}. Size reduced from ${formatFileSize(originalSize)} to ${formatFileSize(finalSize)} (${sizeReductionPercent}% smaller)`;
        } else {
          // Client-side processing was sufficient
          feedbackMessage = `Image processed: ${originalImageInfo.width}×${originalImageInfo.height} → ${result.processedWidth}×${result.processedHeight}. Size reduced from ${formatFileSize(originalSize)} to ${formatFileSize(finalSize)} (${sizeReductionPercent}% smaller)`;
        }
        showToast(feedbackMessage);
      } else {
        // Fallback if we don't have original dimensions
        const sizeReduction = result.originalSize - result.size;
        const sizeReductionPercent = (
          (sizeReduction / result.originalSize) *
          100
        ).toFixed(0);
        const action = result.optimized ? "optimized" : "processed";
        const feedbackMessage = `Image ${action} to ${result.processedWidth}×${result.processedHeight}. Size reduced from ${formatFileSize(result.originalSize)} to ${formatFileSize(result.size)} (${sizeReductionPercent}% smaller)`;
        showToast(feedbackMessage);
      }

      closeCropModal();
    } catch (error) {
      console.error("Upload error:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to upload photo",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const removePhoto = () => {
    setFormData((prev) => ({ ...prev, photoUrl: "" }));
    // Clear current saved signature when photo is removed
    if (currentSavedSignature) {
      setCurrentSavedSignature(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePhotoAreaClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".remove-photo-btn")) return;
    if (target.closest(".upload-preview") && formData.photoUrl) return;
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Bepp Email Signature Generator</h1>
        <p className="subtitle">
          Fill in the details below to generate your Bepp email signature
        </p>
      </header>

      <main className="container">
        <section className="form-section">
          <h2>Details</h2>
          <form>
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                placeholder="Ian Thorslund"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                onBlur={handleNameBlur}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="title">Job Title</label>
              <input
                type="text"
                id="title"
                name="title"
                placeholder="Tech Lead"
                value={formData.title}
                onChange={(e) => handleInputChange("title", e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="ian.thorslund@bepp.se"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                placeholder="070 720 10 89"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Profile Photo</label>
              <div
                className={`photo-upload-area ${dragOver ? "drag-over" : ""}`}
                onClick={handlePhotoAreaClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  id="photoFile"
                  name="photoFile"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileSelect(file);
                    }
                  }}
                />
                {!formData.photoUrl ? (
                  <div className="upload-placeholder">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      ></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <span>Click or drag to upload photo</span>
                    <span className="upload-hint">
                      Square crop will be applied
                    </span>
                  </div>
                ) : (
                  <div className="upload-preview">
                    <img src={formData.photoUrl} alt="Preview" />
                    <button
                      type="button"
                      className="remove-photo-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePhoto();
                      }}
                      title="Remove photo"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <span className="hint">Leave empty for default placeholder</span>
            </div>
          </form>
        </section>

        <section className="preview-section">
          <h2>Preview</h2>
          <div className="preview-container">
            <div className="email-mock">
              <div className="email-mock-header">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <div className="email-mock-body">
                <div className="email-content">
                  <p className="email-greeting">Best regards,</p>
                  <div
                    className="signature-preview"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="preview-actions">
            <div className="save-button-wrapper">
              <button
                type="button"
                className="btn-primary btn-save-cta"
                onClick={saveCurrentSignature}
                disabled={!isSignatureComplete() || isSavingSignature}
                title={getDisabledTooltip()}
                aria-label={getDisabledTooltip()}
              >
                {isSavingSignature ? (
                  <>
                    <svg
                      className="spinner"
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="17 21 17 13 7 13 7 21"></polyline>
                      <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    Save Signature
                  </>
                )}
              </button>
              {!isSignatureComplete() && (
                <div className="save-button-hint">
                  Missing: {getMissingFields().join(", ")}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Saved Signatures Section */}
      <section className="saved-section">
        <div className="saved-header">
          <h2>Saved Signatures</h2>
        </div>
        <div className="saved-list">
          {isLoadingSignatures ? (
            <div className="saved-loading">Loading signatures...</div>
          ) : savedSignatures.length === 0 ? (
            <div className="saved-empty">
              No saved signatures yet. Create one and click "Save Signature" to
              get started!
            </div>
          ) : (
            savedSignatures.map((signature) => (
              <div key={signature.id} className="saved-item">
                <div className="saved-item-preview">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: signature.html,
                    }}
                  />
                </div>
                <div className="saved-item-info">
                  <div className="saved-item-date">
                    {new Date(signature.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="saved-item-actions">
                  <button
                    type="button"
                    className="saved-item-btn saved-item-btn-copy"
                    onClick={() => handleCopySignature(signature)}
                    title="Copy signature HTML"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                      ></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy
                  </button>
                  <button
                    type="button"
                    className="saved-item-btn saved-item-btn-delete"
                    onClick={() => handleDeleteSignature(signature.id)}
                    disabled={deletingSignatureIds.has(signature.id)}
                    title="Delete signature"
                  >
                    {deletingSignatureIds.has(signature.id) ? (
                      <>
                        <svg
                          className="spinner"
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Toast Notification */}
      <div className={`toast ${toastVisible ? "visible" : "hidden"}`}>
        {toastMessage}
      </div>

      {/* Crop Modal */}
      {isCropModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeCropModal();
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <h3>Crop Photo</h3>
              <button
                type="button"
                className="modal-close"
                onClick={closeCropModal}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="crop-container">
                <img ref={cropImageRef} src={cropImageSrc} alt="Crop preview" />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeCropModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={uploadCroppedImage}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Apply Crop"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
