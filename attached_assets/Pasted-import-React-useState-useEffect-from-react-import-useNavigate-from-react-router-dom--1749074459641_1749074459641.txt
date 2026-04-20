import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Plus,
  X,
  Loader2,
  FileText,
  Link as LinkIcon,
  Trash2,
  ExternalLink,
  Upload,
  Search,
  Filter,
  ChevronDown,
  Bot,
  Clock,
  AlertCircle,
  Speech,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";

interface KnowledgeBaseDocument {
  id: string;
  name: string;
  type: "file" | "url";
  dependent_agents: string[];
  access_level: string;
  created_at?: number;
}

interface KnowledgeBaseListResponse {
  documents: KnowledgeBaseDocument[];
  has_more: boolean;
  next_cursor: string | null;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const KnowledgeBase = () => {
  const { getEffectiveUser, getEffectiveUserData, isAdmin } = useAuth();
  const user = getEffectiveUser();
  const userData = getEffectiveUserData();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documents, setDocuments] = useState<KnowledgeBaseDocument[]>([]);
  const [createType, setCreateType] = useState<"file" | "url">("file");
  const [formData, setFormData] = useState({
    url: "",
    file: null as File | null,
  });
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "file" | "url">("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const fetchDocuments = async () => {
    if (!user) return;

    try {
      setLoadingDocuments(true);
      const response = await fetch(
        `${BACKEND_URL}/knowledge-base/${user.uid}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch knowledge base documents");
      }

      const data: KnowledgeBaseListResponse = await response.json();
      setDocuments(data.documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setLoadingDocuments(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [user]);

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setLoading(true);
      setError("");

      let response;
      if (createType === "url") {
        response = await fetch(`${BACKEND_URL}/knowledge-base/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify({
            user_id: user.uid,
            url: formData.url,
          }),
        });
      } else {
        if (!formData.file) {
          setError("Please select a file");
          return;
        }

        const formDataObj = new FormData();
        formDataObj.append("file", formData.file);
        formDataObj.append("user_id", user.uid);

        response = await fetch(`${BACKEND_URL}/knowledge-base/create`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: formDataObj,
        });
      }

      if (!response.ok) {
        throw new Error("Failed to create knowledge base document");
      }

      setIsCreating(false);
      setFormData({ url: "", file: null });
      await fetchDocuments();
    } catch (error) {
      console.error("Error creating document:", error);
      setError("Failed to create document. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (
      !user ||
      !window.confirm("Are you sure you want to delete this document?")
    )
      return;

    try {
      setLoading(true);
      const response = await fetch(
        `${BACKEND_URL}/knowledge-base/${user.uid}/${documentId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete document");
      }

      await fetchDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Failed to delete document. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || doc.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gray-900 dark:text-white">
            Knowledge Base
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage your documents and URLs for AI training
          </p>
        </div>
        <button onClick={() => setIsCreating(true)} className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Document
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white dark:bg-dark-200 rounded-xl shadow-sm border border-gray-100 dark:border-dark-100 p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="input input-with-icon pl-10"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={cn(
                "flex items-center space-x-2 px-4 py-2.5 text-sm rounded-lg border transition-colors",
                filterType !== "all"
                  ? "border-primary bg-primary-50/50 text-primary dark:border-primary-400 dark:bg-primary-400/10 dark:text-primary-400"
                  : "border-gray-200 dark:border-dark-100 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-dark-50",
              )}
            >
              <Filter className="w-4 h-4" />
              <span>
                {filterType === "all"
                  ? "All Types"
                  : filterType === "file"
                    ? "Files Only"
                    : "URLs Only"}
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {isFilterOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-30"
                    onClick={() => setIsFilterOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-200 rounded-lg shadow-lg border border-gray-100 dark:border-dark-100 overflow-hidden z-40"
                  >
                    <button
                      onClick={() => {
                        setFilterType("all");
                        setIsFilterOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center space-x-2 px-4 py-2.5 text-sm transition-colors",
                        filterType === "all"
                          ? "bg-primary-50/50 text-primary dark:bg-primary-400/10 dark:text-primary-400"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-100",
                      )}
                    >
                      <Database className="w-4 h-4" />
                      <span>All Types</span>
                    </button>
                    <button
                      onClick={() => {
                        setFilterType("file");
                        setIsFilterOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center space-x-2 px-4 py-2.5 text-sm transition-colors",
                        filterType === "file"
                          ? "bg-primary-50/50 text-primary dark:bg-primary-400/10 dark:text-primary-400"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-100",
                      )}
                    >
                      <FileText className="w-4 h-4" />
                      <span>Files Only</span>
                    </button>
                    <button
                      onClick={() => {
                        setFilterType("url");
                        setIsFilterOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center space-x-2 px-4 py-2.5 text-sm transition-colors",
                        filterType === "url"
                          ? "bg-primary-50/50 text-primary dark:bg-primary-400/10 dark:text-primary-400"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-100",
                      )}
                    >
                      <LinkIcon className="w-4 h-4" />
                      <span>URLs Only</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-dark-200 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-dark-100">
                <div className="flex items-center space-x-2">
                  <Database className="w-6 h-6 text-primary dark:text-primary-400" />
                  <h2 className="text-xl font-heading font-bold text-gray-900 dark:text-white">
                    Add to Knowledge Base
                  </h2>
                </div>
                <button
                  onClick={() => setIsCreating(false)}
                  className="p-2 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setCreateType("file")}
                      className={cn(
                        "flex-1 py-3 px-4 rounded-lg border transition-colors",
                        createType === "file"
                          ? "border-primary bg-primary-50/50 text-primary dark:border-primary-400 dark:bg-primary-400/10 dark:text-primary-400"
                          : "border-gray-200 dark:border-dark-100 text-gray-600 dark:text-gray-400 hover:border-primary/50 dark:hover:border-primary-400/50",
                      )}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        <Upload className="w-5 h-5" />
                        <span>Upload File</span>
                      </div>
                    </button>
                    <button
                      onClick={() => setCreateType("url")}
                      className={cn(
                        "flex-1 py-3 px-4 rounded-lg border transition-colors",
                        createType === "url"
                          ? "border-primary bg-primary-50/50 text-primary dark:border-primary-400 dark:bg-primary-400/10 dark:text-primary-400"
                          : "border-gray-200 dark:border-dark-100 text-gray-600 dark:text-gray-400 hover:border-primary/50 dark:hover:border-primary-400/50",
                      )}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        <LinkIcon className="w-5 h-5" />
                        <span>Add URL</span>
                      </div>
                    </button>
                  </div>
                </div>

                <form onSubmit={handleCreateDocument} className="space-y-6">
                  {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg flex items-center space-x-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <p className="text-sm">{error}</p>
                    </div>
                  )}

                  {createType === "url" ? (
                    <div className="space-y-2">
                      <label
                        htmlFor="url"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        URL
                      </label>
                      <input
                        type="url"
                        id="url"
                        value={formData.url}
                        onChange={(e) =>
                          setFormData({ ...formData, url: e.target.value })
                        }
                        placeholder="https://example.com/document"
                        className="input"
                        required
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label
                        htmlFor="file"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        File
                      </label>
                      <input
                        type="file"
                        id="file"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            file: e.target.files?.[0] || null,
                          })
                        }
                        className="input"
                        accept=".pdf,.doc,.docx,.txt"
                        required
                      />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Supported formats: PDF, DOC, DOCX, TXT
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-dark-100">
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn btn-primary"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Add Document"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white dark:bg-dark-200 rounded-xl shadow-sm border border-gray-100 dark:border-dark-100 overflow-hidden">
        {loadingDocuments ? (
          <div className="p-8 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary dark:text-primary-400" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">
              Loading documents...
            </span>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="p-8 text-center">
            <Database className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
            <h3 className="text-lg font-heading font-medium text-gray-900 dark:text-white mb-2">
              {searchQuery || filterType !== "all"
                ? "No matching documents found"
                : "No documents yet"}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {searchQuery || filterType !== "all"
                ? "Try adjusting your search or filters"
                : "Add documents or URLs to your knowledge base to get started"}
            </p>
            {!searchQuery && filterType === "all" && (
              <button
                onClick={() => setIsCreating(true)}
                className="btn btn-outline"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Document
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-100">
            {filteredDocuments.map((document) => (
              <motion.div
                key={document.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-6">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 dark:from-primary/30 dark:to-primary/20 flex items-center justify-center">
                        {document.type === "file" ? (
                          <FileText className="w-6 h-6 text-primary dark:text-primary-400" />
                        ) : (
                          <LinkIcon className="w-6 h-6 text-primary dark:text-primary-400" />
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-heading font-medium text-gray-900 dark:text-white mb-1">
                        {document.name}
                      </h3>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Type:
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-100 px-2 py-1 rounded capitalize">
                            {document.type}
                          </span>
                        </div>
                        {document.dependent_agents?.length > 0 && (
                          <div className="flex items-center space-x-2">
                            <Speech className="w-4 h-4 text-primary dark:text-primary-400" />
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {document.dependent_agents.length} Connected Agent
                              {document.dependent_agents.length === 1
                                ? ""
                                : "s"}
                            </span>
                          </div>
                        )}
                        {document.created_at && (
                          <div className="flex items-center space-x-2">
                            <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {new Date(
                                document.created_at * 1000,
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() =>
                        navigate(`/dashboard/knowledge/${document.id}`)
                      }
                      className="p-2 text-gray-400 hover:text-primary dark:text-gray-500 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-100 transition-colors"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDocument(document.id)}
                      className="p-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase;