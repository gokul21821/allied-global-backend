import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  FileText,
  Link as LinkIcon,
  AlertCircle,
  Bot,
  ArrowRight,
  Code,
  Database,
  Clock,
  Eye,
  ExternalLink,
  Speech,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";

interface KnowledgeBaseDocument {
  id: string;
  name: string;
  type: "file" | "url";
  extracted_inner_html: string;
  mime_type?: string;
  size?: number;
  created_at?: number;
}

interface DependentAgent {
  id: string;
  name: string;
  last_used?: number;
}

interface DependentAgentsResponse {
  agents: DependentAgent[];
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const KnowledgeBaseDetails = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const { user } = useAuth();
  const [document, setDocument] = useState<KnowledgeBaseDocument | null>(null);
  const [dependentAgents, setDependentAgents] = useState<DependentAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [error, setError] = useState("");
  const [showRawHtml, setShowRawHtml] = useState(false);

  useEffect(() => {
    const fetchDocument = async () => {
      if (!user || !documentId) return;

      try {
        setLoading(true);
        const response = await fetch(
          `${BACKEND_URL}/knowledge-base/${user.uid}/${documentId}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await user.getIdToken()}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch document details");
        }

        const data = await response.json();
        setDocument(data);
      } catch (error) {
        console.error("Error fetching document:", error);
        setError("Failed to load document details. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    const fetchDependentAgents = async () => {
      if (!user || !documentId) return;

      try {
        setLoadingAgents(true);
        const response = await fetch(
          `${BACKEND_URL}/knowledge-base/${user.uid}/${documentId}/dependent-agents`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await user.getIdToken()}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch dependent agents");
        }

        const data: DependentAgentsResponse = await response.json();
        setDependentAgents(data.agents || []);
      } catch (error) {
        console.error("Error fetching dependent agents:", error);
        setDependentAgents([]);
      } finally {
        setLoadingAgents(false);
      }
    };

    fetchDocument();
    fetchDependentAgents();
  }, [user, documentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary dark:text-primary-400" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-dark-200 rounded-xl shadow-sm border border-gray-100 dark:border-dark-100 p-6">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-heading font-bold text-gray-900 dark:text-white mb-2">
              {error || "Document not found"}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              The document you're looking for doesn't exist or you don't have
              access to it.
            </p>
            <Link
              to="/dashboard/knowledge"
              className="inline-flex items-center text-primary hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Knowledge Base
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link
          to="/dashboard/knowledge"
          className="inline-flex items-center text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Knowledge Base
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-dark-200 rounded-xl shadow-sm border border-gray-100 dark:border-dark-100 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-dark-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 dark:from-primary/30 dark:to-primary/20 flex items-center justify-center">
                    {document.type === "file" ? (
                      <FileText className="w-6 h-6 text-primary dark:text-primary-400" />
                    ) : (
                      <LinkIcon className="w-6 h-6 text-primary dark:text-primary-400" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-2xl font-heading font-bold text-gray-900 dark:text-white truncate">
                      {document.name}
                    </h1>
                    <div className="flex items-center space-x-4 mt-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          Type:
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-100 px-2 py-1 rounded capitalize">
                          {document.type}
                        </span>
                      </div>
                      {document.mime_type && (
                        <div className="flex items-center space-x-2">
                          <Code className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {document.mime_type}
                          </span>
                        </div>
                      )}
                      {document.size && (
                        <div className="flex items-center space-x-2">
                          <Database className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatFileSize(document.size)}
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
                {document.type === "url" && (
                  <a
                    href={document.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-primary hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 bg-primary-50/50 dark:bg-primary-400/10 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Visit URL</span>
                  </a>
                )}
              </div>
            </div>

            {/* Document Content */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-heading font-medium text-gray-900 dark:text-white">
                  Document Content
                </h2>
                <button
                  onClick={() => setShowRawHtml(!showRawHtml)}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-primary dark:text-gray-400 dark:hover:text-primary-400 bg-gray-100 hover:bg-gray-200 dark:bg-dark-100 dark:hover:bg-dark-50 rounded-lg transition-colors"
                >
                  {showRawHtml ? (
                    <>
                      <Eye className="w-4 h-4" />
                      <span>Show Rendered</span>
                    </>
                  ) : (
                    <>
                      <Code className="w-4 h-4" />
                      <span>Show Raw HTML</span>
                    </>
                  )}
                </button>
              </div>

              <div
                className={cn(
                  "bg-gray-50 dark:bg-dark-100 rounded-xl p-6 overflow-auto max-h-[600px]",
                  showRawHtml
                    ? "font-mono text-sm"
                    : "prose dark:prose-invert max-w-none",
                )}
              >
                {showRawHtml ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {document.extracted_inner_html}
                  </pre>
                ) : (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: document.extracted_inner_html,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Connected Agents */}
          <div className="bg-white dark:bg-dark-200 rounded-xl shadow-sm border border-gray-100 dark:border-dark-100 overflow-hidden">
            <div className="p-4 bg-gray-50 dark:bg-dark-100 border-b border-gray-200 dark:border-dark-100">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-medium text-gray-900 dark:text-white">
                  Connected Agents
                </h3>
                <span className="bg-primary/10 text-primary dark:text-primary-400 px-2 py-1 rounded text-sm font-medium">
                  {dependentAgents.length} Total
                </span>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-dark-100">
              {loadingAgents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary dark:text-primary-400" />
                </div>
              ) : dependentAgents.length === 0 ? (
                <div className="px-6 py-8">
                  <div className="text-center">
                    <div className="mx-auto h-12 w-12 rounded-full bg-gray-50 dark:bg-dark-100 flex items-center justify-center">
                      <Speech className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                    </div>
                    <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
                      No agents connected
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      This document is not being used by any agents yet.
                    </p>
                  </div>
                </div>
              ) : (
                dependentAgents.map((agent) => (
                  <Link
                    key={agent.id}
                    to={`/dashboard/agents/${agent.id}`}
                    className="block hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors"
                  >
                    <div className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0">
                          <div className="h-10 w-10 rounded-lg bg-primary/5 dark:bg-primary-400/10 flex items-center justify-center flex-shrink-0">
                            <Speech className="h-5 w-5 text-primary dark:text-primary-400" />
                          </div>
                          <div className="ml-4 truncate">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {agent.name}
                            </p>
                            <div className="flex items-center space-x-2 mt-1">
                              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {agent.id}
                              </span>
                              {agent.last_used && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  Last used{" "}
                                  {new Date(
                                    agent.last_used * 1000,
                                  ).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="rounded-full bg-primary/5 dark:bg-primary-400/10 p-1">
                            <ArrowRight className="h-4 w-4 text-primary dark:text-primary-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseDetails;
