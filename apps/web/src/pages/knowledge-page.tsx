import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  FileText,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  TestTube2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  KbDocumentDto,
  KnowledgeBaseDto,
  RetrieveTestResultDto,
} from '@botme/shared';
import { Badge, Button, Card, Input, Select, SelectOption } from '@botme/ui';
import { api, ApiError } from '@/lib/api';
import { ru } from '@/i18n/ru';
import {
  docStatusBadge,
  filterDocuments,
  filterKbs,
  isIndexing,
  sourceBadge,
  UPLOAD_MIME,
  formatDocErrorMessage,
  type WorkspaceTab,
} from '@/components/knowledge/kb-utils';
import { useDebouncedSave } from '@/components/knowledge/use-debounced-save';

async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const buf = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function resetKbWorkspaceState(
  queryClient: ReturnType<typeof useQueryClient>,
  setters: {
    setSelectedDocId: (v: string | null) => void;
    setEditorTitle: (v: string) => void;
    setEditorContent: (v: string) => void;
    setEditorPreview: (v: boolean) => void;
    setChunkSearch: (v: string) => void;
    setRetrievalQuery: (v: string) => void;
    setRetrievalResult: (v: RetrieveTestResultDto | null) => void;
    setDocSearch: (v: string) => void;
    setStatusFilter: (v: string) => void;
    setTab: (v: WorkspaceTab) => void;
  },
) {
  setters.setSelectedDocId(null);
  setters.setEditorTitle('');
  setters.setEditorContent('');
  setters.setEditorPreview(false);
  setters.setChunkSearch('');
  setters.setRetrievalQuery('');
  setters.setRetrievalResult(null);
  setters.setDocSearch('');
  setters.setStatusFilter('ALL');
  setters.setTab('documents');
  void queryClient.removeQueries({ queryKey: ['kb-preview'] });
  void queryClient.removeQueries({ queryKey: ['kb-document'] });
  void queryClient.removeQueries({ queryKey: ['kb-chunks'] });
}

export function KnowledgePage() {
  const queryClient = useQueryClient();
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('documents');
  const [kbSearch, setKbSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [newKbName, setNewKbName] = useState('');
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorPreview, setEditorPreview] = useState(false);
  const [chunkSearch, setChunkSearch] = useState('');
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [retrievalResult, setRetrievalResult] = useState<RetrieveTestResultDto | null>(null);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [deleteKbOpen, setDeleteKbOpen] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: '', maxDepth: 0, maxPages: 20 });

  const kbsQuery = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: () => api.knowledgeBases.list(),
  });

  const kbQuery = useQuery({
    queryKey: ['knowledge-base', selectedKbId],
    queryFn: () => api.knowledgeBases.get(selectedKbId!),
    enabled: !!selectedKbId,
  });

  const docsQuery = useQuery({
    queryKey: ['kb-documents', selectedKbId],
    queryFn: () => api.knowledgeBases.listDocuments(selectedKbId!),
    enabled: !!selectedKbId,
    refetchInterval: (q) => {
      const docs = q.state.data as KbDocumentDto[] | undefined;
      return docs?.some((d) => isIndexing(d.status)) ? 3000 : false;
    },
  });

  const docDetailQuery = useQuery({
    queryKey: ['kb-document', selectedKbId, selectedDocId],
    queryFn: () => api.knowledgeBases.getDocument(selectedKbId!, selectedDocId!),
    enabled: !!selectedKbId && !!selectedDocId,
  });

  const chunksQuery = useQuery({
    queryKey: ['kb-chunks', selectedKbId, selectedDocId, chunkSearch],
    queryFn: () =>
      api.knowledgeBases.listChunks(selectedKbId!, selectedDocId!, {
        page: 1,
        search: chunkSearch || undefined,
      }),
    enabled: !!selectedKbId && !!selectedDocId && tab === 'chunks',
  });

  const previewQuery = useQuery({
    queryKey: ['kb-preview', selectedKbId, editorContent],
    queryFn: () =>
      api.knowledgeBases.previewChunks(selectedKbId!, {
        content: editorContent,
        mimeType: 'text/markdown',
      }),
    enabled: !!selectedKbId && tab === 'editor' && editorContent.length > 0,
  });

  useEffect(() => {
    if (!selectedDocId || !docDetailQuery.data) return;
    if (docDetailQuery.data.id !== selectedDocId || docDetailQuery.data.sourceType !== 'TEXT') {
      return;
    }
    setEditorTitle(docDetailQuery.data.title);
    setEditorContent(docDetailQuery.data.rawContent ?? '');
  }, [docDetailQuery.data, selectedDocId]);

  const selectKb = useCallback(
    (kbId: string) => {
      resetKbWorkspaceState(queryClient, {
        setSelectedDocId,
        setEditorTitle,
        setEditorContent,
        setEditorPreview,
        setChunkSearch,
        setRetrievalQuery,
        setRetrievalResult,
        setDocSearch,
        setStatusFilter,
        setTab,
      });
      setSelectedKbId(kbId);
    },
    [queryClient],
  );

  const createKb = useMutation({
    mutationFn: () => api.knowledgeBases.create({ name: newKbName }),
    onSuccess: (kb) => {
      setNewKbName('');
      setSelectedKbId(kb.id);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : ru.common.error),
  });

  const saveText = useMutation({
    mutationFn: async () => {
      if (!selectedKbId) return;
      if (selectedDocId && docDetailQuery.data?.sourceType === 'TEXT') {
        return api.knowledgeBases.updateText(selectedKbId, selectedDocId, {
          title: editorTitle,
          content: editorContent,
        });
      }
      return api.knowledgeBases.createText(selectedKbId, {
        title: editorTitle || 'Без названия',
        content: editorContent,
        mimeType: 'text/markdown',
      });
    },
    onSuccess: (doc) => {
      if (doc) {
        setSelectedDocId(doc.id);
        void queryClient.invalidateQueries({ queryKey: ['kb-documents', selectedKbId] });
      }
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : ru.common.error),
  });

  useDebouncedSave(editorContent, () => {
    if (tab === 'editor' && editorContent.trim().length > 10 && selectedKbId) {
      saveText.mutate();
    }
  });

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedKbId) return;
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const mimeType = UPLOAD_MIME[ext];
      if (!mimeType) throw new Error('Неподдерживаемый формат файла');
      const fileHash = await sha256Hex(await file.arrayBuffer());
      const doc = await api.knowledgeBases.uploadFile(
        selectedKbId,
        file,
        fileHash,
        mimeType as import('@botme/shared').UploadDocumentInput['mimeType'],
      );
      setSelectedDocId(doc.id);
      return doc;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb-documents', selectedKbId] });
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === 'Неподдерживаемый формат файла') {
        setError('Неподдерживаемый формат. Допустимо: txt, md, pdf, docx, csv, xlsx, html, json');
        return;
      }
      setError(e instanceof ApiError ? e.message : ru.common.error);
    },
  });

  const addUrl = useMutation({
    mutationFn: () =>
      api.knowledgeBases.createUrl(selectedKbId!, {
        url: urlForm.url,
        maxDepth: urlForm.maxDepth,
        maxPages: urlForm.maxPages,
        respectRobots: true,
      }),
    onSuccess: (doc) => {
      setUrlModalOpen(false);
      setSelectedDocId(doc.id);
      void queryClient.invalidateQueries({ queryKey: ['kb-documents', selectedKbId] });
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : ru.common.error),
  });

  const retryDoc = useMutation({
    mutationFn: (docId: string) => api.knowledgeBases.retry(selectedKbId!, docId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['kb-documents', selectedKbId] }),
  });

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => api.knowledgeBases.removeDocument(selectedKbId!, docId),
    onSuccess: () => {
      setSelectedDocId(null);
      void queryClient.invalidateQueries({ queryKey: ['kb-documents', selectedKbId] });
    },
  });

  const deleteKb = useMutation({
    mutationFn: () => api.knowledgeBases.remove(selectedKbId!),
    onSuccess: () => {
      setDeleteKbOpen(false);
      setSelectedKbId(null);
      setSelectedDocId(null);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : ru.common.error),
  });

  const runRetrieval = useMutation({
    mutationFn: () => api.knowledgeBases.retrieveTest(selectedKbId!, { query: retrievalQuery }),
    onSuccess: setRetrievalResult,
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : ru.common.error),
  });

  const filteredKbs = useMemo(
    () => filterKbs(kbsQuery.data ?? [], kbSearch),
    [kbsQuery.data, kbSearch],
  );
  const filteredDocs = useMemo(
    () => filterDocuments(docsQuery.data ?? [], docSearch, statusFilter),
    [docsQuery.data, docSearch, statusFilter],
  );
  const selectedDoc = filteredDocs.find((d) => d.id === selectedDocId) ?? docDetailQuery.data;
  const activeKb = kbQuery.data;

  const startNewEditor = useCallback(() => {
    setSelectedDocId(null);
    setEditorTitle('');
    setEditorContent('');
    setTab('editor');
  }, []);

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">{ru.knowledge.title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{ru.knowledge.subtitle}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => setError(null)}>
            Закрыть
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12">
        {/* Left sidebar — KB list */}
        <Card className="flex flex-col overflow-hidden border-white/10 bg-black/20 p-0 lg:col-span-3">
          <div className="border-b border-white/5 p-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                className="pl-8"
                placeholder={ru.knowledge.searchKb}
                value={kbSearch}
                onChange={(e) => setKbSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={ru.knowledge.newKb}
                value={newKbName}
                onChange={(e) => setNewKbName(e.target.value)}
              />
              <Button onClick={() => createKb.mutate()} disabled={!newKbName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredKbs.map((kb: KnowledgeBaseDto) => (
              <button
                key={kb.id}
                type="button"
                onClick={() => selectKb(kb.id)}
                className={`w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/5 ${selectedKbId === kb.id ? 'bg-[#39ff14]/5' : ''}`}
              >
                <div className="font-medium text-white">{kb.name}</div>
                <div className="text-xs text-zinc-500">
                  {kb.documentCount} док · {kb.chunkCount} chunks · {kb.tokenCount.toLocaleString('ru')} tok
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Main workspace */}
        <Card className="flex min-h-0 flex-col overflow-hidden border-white/10 bg-black/20 p-0 lg:col-span-6">
          {!activeKb ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
              {ru.knowledge.selectKb}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
                <h2 className="mr-auto text-lg font-semibold text-white">{activeKb.name}</h2>
                <Button
                  variant="ghost"
                  className="text-red-400"
                  onClick={() => setDeleteKbOpen(true)}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Удалить базу
                </Button>
                {(['documents', 'editor', 'chunks', 'retrieval', 'settings'] as WorkspaceTab[]).map((t) => (
                  <Button
                    key={t}
                    variant={tab === t ? 'primary' : 'ghost'}
                    onClick={() => setTab(t)}
                  >
                    {t === 'documents' && <FileText className="mr-1 h-3 w-3" />}
                    {t === 'editor' && <BookOpen className="mr-1 h-3 w-3" />}
                    {t === 'chunks' && <Search className="mr-1 h-3 w-3" />}
                    {t === 'retrieval' && <TestTube2 className="mr-1 h-3 w-3" />}
                    {t === 'settings' && <Settings className="mr-1 h-3 w-3" />}
                    {ru.knowledge.tabs[t]}
                  </Button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {tab === 'documents' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#39ff14]/10 px-3 py-2 text-sm text-[#39ff14]">
                        <Upload className="h-4 w-4" />
                        {ru.knowledge.upload}
                        <input
                          type="file"
                          accept=".txt,.md,.pdf,.docx,.csv,.xlsx,.html,.htm,.json"
                          className="hidden"
                          multiple
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files) Array.from(files).forEach((f) => uploadFile.mutate(f));
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <Button variant="secondary" onClick={startNewEditor}>
                        <BookOpen className="mr-1 h-4 w-4" /> {ru.knowledge.newText}
                      </Button>
                      <Button variant="secondary" onClick={() => setUrlModalOpen(true)}>
                        <Globe className="mr-1 h-4 w-4" /> URL
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder={ru.knowledge.searchDocs}
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
                      />
                      <Select className="w-auto px-2 py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <SelectOption value="ALL">Все статусы</SelectOption>
                        <SelectOption value="INDEXED">Индексирован</SelectOption>
                        <SelectOption value="FAILED">Ошибка</SelectOption>
                        <SelectOption value="PARSING">Парсинг</SelectOption>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      {filteredDocs.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => {
                            setSelectedDocId(doc.id);
                            if (doc.sourceType === 'TEXT') setTab('editor');
                          }}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${selectedDocId === doc.id ? 'border-[#39ff14]/30 bg-white/5' : 'border-white/10'}`}
                        >
                          <div>
                            <div className="flex items-center gap-2 text-sm text-white">
                              {doc.title || doc.filename}
                              {sourceBadge(doc.sourceType)}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {doc.chunkCount} chunks · {doc.tokenCount} tok
                              {formatDocErrorMessage(doc.errorMessage) &&
                                ` · ${formatDocErrorMessage(doc.errorMessage)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {docStatusBadge(doc.status)}
                            {doc.status === 'FAILED' && (
                              <Button
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retryDoc.mutate(doc.id);
                                }}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'editor' && (
                  <div className="space-y-3">
                    <Input
                      label={ru.knowledge.docTitle}
                      value={editorTitle}
                      onChange={(e) => setEditorTitle(e.target.value)}
                    />
                    <div className="flex gap-2 text-xs text-zinc-500">
                      <span>{previewQuery.data?.tokenCount ?? '—'} tok</span>
                      <span>~{previewQuery.data?.chunkCount ?? '—'} chunks</span>
                      {saveText.isPending && (
                        <span className="flex items-center gap-1 text-[#39ff14]">
                          <Loader2 className="h-3 w-3 animate-spin" /> сохранение…
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={editorPreview ? 'ghost' : 'secondary'}
                        onClick={() => setEditorPreview(false)}
                      >
                        Markdown
                      </Button>
                      <Button
                        variant={editorPreview ? 'secondary' : 'ghost'}
                        onClick={() => setEditorPreview(true)}
                      >
                        Preview
                      </Button>
                    </div>
                    {editorPreview ? (
                      <div className="min-h-[300px] rounded-xl border border-white/10 bg-black/40 p-4 text-sm whitespace-pre-wrap text-zinc-200">
                        {editorContent}
                      </div>
                    ) : (
                      <textarea
                        className="min-h-[300px] w-full rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-white"
                        value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        placeholder="# Заголовок&#10;&#10;Текст базы знаний…"
                      />
                    )}
                    {previewQuery.data?.chunks && previewQuery.data.chunks.length > 0 && (
                      <div className="rounded-lg border border-white/10 p-3">
                        <p className="mb-2 text-xs text-zinc-500">{ru.knowledge.chunkPreview}</p>
                        {previewQuery.data.chunks.map((c) => (
                          <p key={c.chunkIndex} className="text-xs text-zinc-400">
                            #{c.chunkIndex} ({c.tokenCount} tok): {c.preview}…
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'chunks' && (
                  <div className="space-y-3">
                    {!selectedDocId ? (
                      <p className="text-sm text-zinc-500">{ru.knowledge.selectDoc}</p>
                    ) : (
                      <>
                        <Input
                          placeholder={ru.knowledge.searchChunks}
                          value={chunkSearch}
                          onChange={(e) => setChunkSearch(e.target.value)}
                        />
                        {chunksQuery.isLoading ? (
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#39ff14]" />
                        ) : (
                          <div className="space-y-2">
                            {chunksQuery.data?.items.map((c) => (
                              <div
                                key={c.id}
                                className="rounded-lg border border-white/10 p-3 text-sm"
                              >
                                <div className="mb-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                                  <span>#{c.chunkIndex}</span>
                                  <span>{c.tokenCount} tok</span>
                                  {c.sourcePage && <span>p.{c.sourcePage}</span>}
                                  {c.sourceSection && <span>§{c.sourceSection}</span>}
                                  {c.topic && <span>topic: {c.topic}</span>}
                                  {c.hierarchyLevel > 0 && <span>L{c.hierarchyLevel}</span>}
                                  {c.tags?.length > 0 && <span>{c.tags.join(', ')}</span>}
                                  <Badge variant={c.hasEmbedding ? 'success' : 'warning'}>
                                    {c.hasEmbedding ? 'embedded' : 'pending'}
                                  </Badge>
                                </div>
                                <p className="whitespace-pre-wrap text-zinc-200">{c.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {tab === 'retrieval' && (
                  <div className="space-y-4">
                    <textarea
                      className="min-h-[80px] w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white"
                      placeholder={ru.knowledge.retrievalPlaceholder}
                      value={retrievalQuery}
                      onChange={(e) => setRetrievalQuery(e.target.value)}
                    />
                    <Button
                      onClick={() => runRetrieval.mutate()}
                      disabled={!retrievalQuery.trim() || runRetrieval.isPending}
                    >
                      {runRetrieval.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        ru.knowledge.runRetrieval
                      )}
                    </Button>
                    {retrievalResult && (
                      <div className="space-y-3">
                        <p className="text-xs text-zinc-500">
                          {retrievalResult.retrievalConfidence && (
                            <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 text-[#39ff14]">
                              confidence: {retrievalResult.retrievalConfidence}
                              {retrievalResult.confidenceScore != null &&
                                ` (${retrievalResult.confidenceScore.toFixed(2)})`}
                            </span>
                          )}
                          embed {retrievalResult.embeddingLatencyMs}ms · search{' '}
                          {retrievalResult.searchLatencyMs}ms · prompt ~
                          {retrievalResult.promptTokenEstimate} tok
                          {retrievalResult.embeddingModelUsed &&
                            ` · model ${retrievalResult.embeddingModelUsed}`}
                          {retrievalResult.truncated && ' · truncated'}
                        </p>
                        {retrievalResult.hits.map((h) => (
                          <div key={h.chunkId} className="rounded-lg border border-white/10 p-3">
                            <div className="mb-1 flex justify-between text-xs">
                              <span className="text-[#39ff14]">score {h.score.toFixed(3)}</span>
                              <span className="text-zinc-500">{h.matchReason}</span>
                            </div>
                            <p className="text-xs text-zinc-400">{h.documentTitle}</p>
                            <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-200">
                              {h.content.slice(0, 400)}
                              {h.content.length > 400 ? '…' : ''}
                            </p>
                          </div>
                        ))}
                        <details className="text-xs text-zinc-500">
                          <summary>{ru.knowledge.promptPreview}</summary>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2">
                            {retrievalResult.promptPreview}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                )}

                {tab === 'settings' && activeKb && (
                  <KbSettingsForm kb={activeKb} kbId={selectedKbId!} />
                )}
              </div>
            </>
          )}
        </Card>

        {/* Right inspector */}
        <Card className="flex flex-col overflow-hidden border-white/10 bg-black/20 p-4 lg:col-span-3">
          <h3 className="mb-3 text-sm font-medium text-[#39ff14]">{ru.knowledge.inspector}</h3>
          {!activeKb ? (
            <p className="text-sm text-zinc-500">—</p>
          ) : (
            <dl className="space-y-2 text-sm text-zinc-300">
              <div className="flex justify-between">
                <dt>Chunks</dt>
                <dd>{activeKb.chunkCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tokens</dt>
                <dd>{activeKb.tokenCount.toLocaleString('ru')}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Chunk size</dt>
                <dd>{activeKb.chunkSize}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Overlap</dt>
                <dd>{activeKb.chunkOverlap}</dd>
              </div>
              <div className="flex justify-between">
                <dt>TopK</dt>
                <dd>{activeKb.retrievalTopK}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Threshold</dt>
                <dd>{activeKb.similarityThreshold}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Embedding</dt>
                <dd className="truncate font-mono text-xs">{activeKb.embeddingModelId}</dd>
              </div>
            </dl>
          )}
          {selectedDoc && (
            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="mb-2 text-xs text-zinc-500">{ru.knowledge.docInspector}</p>
              <dl className="space-y-1 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <dt>Status</dt>
                  <dd>{selectedDoc.status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Retry</dt>
                  <dd>{selectedDoc.retryCount}</dd>
                </div>
                {selectedDoc.indexedAt && (
                  <div className="flex justify-between">
                    <dt>Indexed</dt>
                    <dd>{new Date(selectedDoc.indexedAt).toLocaleString('ru-RU')}</dd>
                  </div>
                )}
                {selectedDoc.sourceUrl && (
                  <div>
                    <dt className="text-zinc-500">URL</dt>
                    <dd className="break-all">{selectedDoc.sourceUrl}</dd>
                  </div>
                )}
              </dl>
              <Button
                variant="ghost"
                className="mt-3 text-red-400"
                onClick={() => selectedDocId && deleteDoc.mutate(selectedDocId)}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Удалить
              </Button>
            </div>
          )}
        </Card>
      </div>

      {deleteKbOpen && activeKb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md space-y-4 p-6">
            <h3 className="text-lg font-semibold text-white">Удалить базу знаний?</h3>
            <p className="text-sm text-zinc-400">
              Будет удалено документов: <strong>{activeKb.documentCount}</strong>, chunks:{' '}
              <strong>{activeKb.chunkCount}</strong>. Векторы и файлы в хранилище будут очищены.
              Привязки ассистентов сохранятся, но база станет недоступна для retrieval.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDeleteKbOpen(false)}>
                Отмена
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-500"
                onClick={() => deleteKb.mutate()}
                disabled={deleteKb.isPending}
              >
                {deleteKb.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Удалить'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {urlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md space-y-4 p-6">
            <h3 className="text-lg font-semibold text-white">{ru.knowledge.addUrl}</h3>
            <Input
              label="URL"
              value={urlForm.url}
              onChange={(e) => setUrlForm((f) => ({ ...f, url: e.target.value }))}
            />
            <Input
              label="Глубина crawl"
              type="number"
              value={urlForm.maxDepth}
              onChange={(e) => setUrlForm((f) => ({ ...f, maxDepth: Number(e.target.value) }))}
            />
            <Input
              label="Max pages"
              type="number"
              value={urlForm.maxPages}
              onChange={(e) => setUrlForm((f) => ({ ...f, maxPages: Number(e.target.value) }))}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setUrlModalOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => addUrl.mutate()} disabled={!urlForm.url.trim()}>
                Индексировать
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function KbSettingsForm({ kb, kbId }: { kb: KnowledgeBaseDto; kbId: string }) {
  const queryClient = useQueryClient();
  const ingestionQuery = useQuery({
    queryKey: ['kb-ingestion-status', kbId],
    queryFn: () => api.knowledgeBases.ingestionStatus(kbId),
    refetchInterval: 5000,
  });
  const diagnosticsQuery = useQuery({
    queryKey: ['kb-diagnostics', kbId],
    queryFn: () => api.knowledgeBases.diagnostics(kbId),
    refetchInterval: 10000,
  });
  const heal = useMutation({
    mutationFn: () => api.knowledgeBases.heal(kbId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb-diagnostics', kbId] });
      void queryClient.invalidateQueries({ queryKey: ['kb-ingestion-status', kbId] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge-base', kbId] });
    },
  });
  const [form, setForm] = useState({
    chunkSize: kb.chunkSize,
    chunkOverlap: kb.chunkOverlap,
    retrievalTopK: kb.retrievalTopK,
    similarityThreshold: kb.similarityThreshold,
    embeddingModelId: kb.embeddingModelId,
    chunkStrategy: kb.chunkStrategy as 'smart' | 'fixed',
    hybridRetrievalEnabled: kb.hybridRetrievalEnabled,
    metadataExtractionEnabled: kb.metadataExtractionEnabled,
    aiEnrichmentEnabled: kb.aiEnrichmentEnabled,
    semanticMode: kb.semanticMode as 'hybrid' | 'vector' | 'keyword',
  });

  const save = useMutation({
    mutationFn: () => api.knowledgeBases.update(kbId, form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge-base', kbId] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
    },
  });

  return (
    <div className="max-w-md space-y-3">
      {ingestionQuery.data && (
        <div className="rounded-lg border border-white/10 p-3 text-xs text-zinc-400">
          <p className="mb-1 font-medium text-zinc-300">Ingestion status</p>
          <p>Docs: {ingestionQuery.data.documentCount} · Chunks: {ingestionQuery.data.chunkCount}</p>
          <p>Pending embeddings: {ingestionQuery.data.pendingEmbeddings}</p>
          <p>Model: {ingestionQuery.data.embeddingModelId ?? '—'}</p>
          {Object.entries(ingestionQuery.data.documentsByStatus).map(([s, n]) => (
            <span key={s} className="mr-2">{s}: {n}</span>
          ))}
        </div>
      )}
      {diagnosticsQuery.data && (
        <div className="rounded-lg border border-white/10 p-3 text-xs text-zinc-400">
          <p className="mb-1 font-medium text-zinc-300">
            KB Diagnostics {diagnosticsQuery.data.integrity.healthy ? '✓' : '⚠'}
          </p>
          <p>Embedded: {String(diagnosticsQuery.data.integrity.stats.embeddedChunks)} / {String(diagnosticsQuery.data.integrity.stats.chunks)}</p>
          <p>Orphans: {String(diagnosticsQuery.data.integrity.stats.orphanChunks)} · Stuck: {String(diagnosticsQuery.data.integrity.stats.stuckDocuments)}</p>
          {diagnosticsQuery.data.integrity.issues.map((issue) => (
            <p key={issue.code} className={issue.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}>
              [{issue.code}] {issue.message}
            </p>
          ))}
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => heal.mutate()}
            disabled={heal.isPending}
          >
            {heal.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Self-heal KB'}
          </Button>
        </div>
      )}
      {(['chunkSize', 'chunkOverlap', 'retrievalTopK', 'similarityThreshold'] as const).map((key) => (
        <Input
          key={key}
          label={key}
          type="number"
          step={key === 'similarityThreshold' ? 0.01 : 1}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
        />
      ))}
      <Input
        label="Embedding model"
        value={form.embeddingModelId}
        onChange={(e) => setForm((f) => ({ ...f, embeddingModelId: e.target.value }))}
      />
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Chunk strategy</label>
        <Select
          value={form.chunkStrategy}
          onChange={(e) =>
            setForm((f) => ({ ...f, chunkStrategy: e.target.value as 'smart' | 'fixed' }))
          }
        >
          <SelectOption value="smart">Smart (semantic)</SelectOption>
          <SelectOption value="fixed">Fixed (legacy)</SelectOption>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={form.hybridRetrievalEnabled}
          onChange={(e) => setForm((f) => ({ ...f, hybridRetrievalEnabled: e.target.checked }))}
        />
        Hybrid retrieval (vector + keyword boost)
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={form.metadataExtractionEnabled}
          onChange={(e) => setForm((f) => ({ ...f, metadataExtractionEnabled: e.target.checked }))}
        />
        Metadata extraction
      </label>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}
      </Button>
    </div>
  );
}
