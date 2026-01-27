"use client";

import { useState, useRef, useEffect } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import { generateSignatureHtml, SignatureData } from "@/src/template";

interface SavedSignature extends SignatureData {
  id: string;
  createdAt: number;
  name: string; // Ensure name is always present for display
  html: string; // Stored HTML signature (frozen at save time)
}

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
      ...signature,
      html, // Include the generated HTML
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
  const [showSavedSection, setShowSavedSection] = useState(false);
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false);

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
    setTimeout(() => {
      setToastVisible(false);
    }, 2500);
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
      }
    }
  };

  const handleInputChange = (field: keyof SignatureData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNameBlur = () => {
    autoGenerateEmail(formData.name);
  };

  const copyToClipboard = async () => {
    if (!formData.name) {
      showToast("Please fill in at least a name");
      return;
    }

    const html = generateSignatureHtml(formData);

    try {
      await navigator.clipboard.writeText(html);
      showToast("Copied to clipboard!");
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
      showToast("Copied to clipboard!");
    }
  };

  const saveCurrentSignature = async () => {
    if (!formData.name) {
      showToast("Please fill in at least a name");
      return;
    }

    try {
      // Generate the HTML signature at save time
      const html = generateSignatureHtml(formData);
      await saveSignature(formData, html);
      // Refresh the signatures list
      const signatures = await fetchSavedSignatures();
      setSavedSignatures(signatures);
      showToast("Signature saved!");
      setShowSavedSection(true);
    } catch (error) {
      console.error("Error saving signature:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to save signature",
      );
    }
  };

  const loadSignature = (signature: SavedSignature) => {
    setFormData({
      name: signature.name,
      title: signature.title,
      email: signature.email,
      phone: signature.phone,
      photoUrl: signature.photoUrl,
    });
    showToast("Signature loaded!");
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteSignature = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this signature?")) {
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
      }
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

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setCropImageSrc(e.target.result as string);
        setIsCropModalOpen(true);
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
      closeCropModal();
      showToast("Photo uploaded successfully!");
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
        <h1>Email Signature Generator</h1>
        <p className="subtitle">
          Fill in the details below to generate your BEPP email signature
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
        </section>
      </main>

      {/* Saved Signatures Section */}
      {savedSignatures.length > 0 && (
        <section className="saved-section">
          <div className="saved-header">
            <h2>Saved Signatures</h2>
            <button
              type="button"
              className="toggle-saved-btn"
              onClick={() => setShowSavedSection(!showSavedSection)}
            >
              {showSavedSection ? "Hide" : "Show"} ({savedSignatures.length})
            </button>
          </div>
          {showSavedSection && (
            <div className="saved-list">
              {isLoadingSignatures ? (
                <div className="saved-loading">Loading signatures...</div>
              ) : savedSignatures.length === 0 ? (
                <div className="saved-empty">
                  No saved signatures yet. Create one and click "Save Signature"
                  to get started!
                </div>
              ) : (
                savedSignatures.map((signature) => (
                  <div
                    key={signature.id}
                    className="saved-item"
                    onClick={() => loadSignature(signature)}
                  >
                    <div className="saved-item-preview">
                      <div
                        dangerouslySetInnerHTML={{
                          // Use stored HTML if available, otherwise fallback to regenerating (for backward compatibility)
                          __html:
                            signature.html || generateSignatureHtml(signature),
                        }}
                      />
                    </div>
                    <div className="saved-item-info">
                      <div className="saved-item-name">{signature.name}</div>
                      <div className="saved-item-meta">
                        {signature.title && <span>{signature.title}</span>}
                        <span className="saved-item-date">
                          {new Date(signature.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="saved-item-delete"
                      onClick={(e) => handleDeleteSignature(signature.id, e)}
                      title="Delete signature"
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
                ))
              )}
            </div>
          )}
        </section>
      )}

      <footer className="actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={saveCurrentSignature}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
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
        </button>
        <button type="button" className="btn-primary" onClick={copyToClipboard}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy HTML to Clipboard
        </button>
        <div className={`toast ${toastVisible ? "visible" : "hidden"}`}>
          {toastMessage}
        </div>
      </footer>

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
