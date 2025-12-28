import React from "react";
import {
  Modal,
  Form,
  Button,
  Dropdown,
  Message,
  TextArea,
  Segment,
  Header,
  Icon,
  Label,
  Checkbox,
  Menu,
} from "semantic-ui-react";
import { useMutation, useQuery } from "@apollo/client";
import { toast } from "react-toastify";

/**
 * All available moderation tools for thread/message-based corpus actions.
 * These are pre-selected by default when creating inline moderator agents.
 */
const MODERATION_TOOLS = [
  { name: "get_thread_context", description: "Get thread metadata and status" },
  { name: "get_thread_messages", description: "Retrieve recent messages" },
  { name: "get_message_content", description: "Get full message content" },
  { name: "add_thread_message", description: "Post an agent message" },
  { name: "lock_thread", description: "Lock thread to prevent new messages" },
  { name: "unlock_thread", description: "Unlock a previously locked thread" },
  { name: "delete_message", description: "Soft delete a message" },
  { name: "pin_thread", description: "Pin thread to top of list" },
  { name: "unpin_thread", description: "Unpin a pinned thread" },
] as const;

const DEFAULT_MODERATOR_INSTRUCTIONS = `You are a thread moderator for this corpus. Your role is to:
1. Monitor discussion threads and messages for policy compliance
2. Take appropriate moderation actions when needed
3. Respond helpfully to user questions when appropriate

You have access to thread context, messages, and moderation tools. Use them judiciously.`;
import {
  CREATE_CORPUS_ACTION,
  CreateCorpusActionInput,
  CreateCorpusActionOutput,
  UPDATE_CORPUS_ACTION,
  UpdateCorpusActionInput,
  UpdateCorpusActionOutput,
} from "../../graphql/mutations";
import {
  GET_FIELDSETS,
  GET_ANALYZERS,
  GET_AGENT_CONFIGURATIONS,
  GetFieldsetsInputs,
  GetFieldsetsOutputs,
  GetAnalyzersInputs,
  GetAnalyzersOutputs,
  GetAgentConfigurationsInput,
  GetAgentConfigurationsOutput,
} from "../../graphql/queries";

/**
 * Shape of an existing corpus action for editing
 */
export interface CorpusActionData {
  id: string;
  name: string;
  trigger: string;
  disabled: boolean;
  runOnAllCorpuses: boolean;
  fieldset?: { id: string; name: string } | null;
  analyzer?: { id: string; name: string } | null;
  agentConfig?: { id: string; name: string; description: string } | null;
  agentPrompt?: string;
  preAuthorizedTools?: string[];
}

interface CreateCorpusActionModalProps {
  corpusId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Optional action to edit - if provided, modal is in edit mode */
  actionToEdit?: CorpusActionData | null;
}

type ActionType = "fieldset" | "analyzer" | "agent";
type TriggerType =
  | "add_document"
  | "edit_document"
  | "new_thread"
  | "new_message";

export const CreateCorpusActionModal: React.FC<
  CreateCorpusActionModalProps
> = ({ corpusId, open, onClose, onSuccess, actionToEdit }) => {
  const isEditMode = !!actionToEdit;

  const [name, setName] = React.useState("");
  const [trigger, setTrigger] = React.useState<TriggerType>("add_document");
  const [actionType, setActionType] = React.useState<ActionType>("fieldset");
  const [selectedFieldsetId, setSelectedFieldsetId] = React.useState<
    string | null
  >(null);
  const [selectedAnalyzerId, setSelectedAnalyzerId] = React.useState<
    string | null
  >(null);
  const [selectedAgentConfigId, setSelectedAgentConfigId] = React.useState<
    string | null
  >(null);
  const [agentPrompt, setAgentPrompt] = React.useState("");
  const [preAuthorizedTools, setPreAuthorizedTools] = React.useState<string[]>(
    []
  );
  // Inline agent creation state (for thread/message triggers)
  const [useInlineAgent, setUseInlineAgent] = React.useState(true);
  const [inlineAgentName, setInlineAgentName] = React.useState("");
  const [inlineAgentDescription, setInlineAgentDescription] =
    React.useState("");
  const [inlineAgentInstructions, setInlineAgentInstructions] = React.useState(
    DEFAULT_MODERATOR_INSTRUCTIONS
  );
  const [selectedModerationTools, setSelectedModerationTools] = React.useState<
    string[]
  >(MODERATION_TOOLS.map((t) => t.name));

  const [disabled, setDisabled] = React.useState(false);
  const [runOnAllCorpuses, setRunOnAllCorpuses] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const resetForm = () => {
    setName("");
    setTrigger("add_document");
    setActionType("fieldset");
    setSelectedFieldsetId(null);
    setSelectedAnalyzerId(null);
    setSelectedAgentConfigId(null);
    setAgentPrompt("");
    setPreAuthorizedTools([]);
    // Reset inline agent creation state
    setUseInlineAgent(true);
    setInlineAgentName("");
    setInlineAgentDescription("");
    setInlineAgentInstructions(DEFAULT_MODERATOR_INSTRUCTIONS);
    setSelectedModerationTools(MODERATION_TOOLS.map((t) => t.name));
    setDisabled(false);
    setRunOnAllCorpuses(false);
  };

  // Helper to normalize trigger value to lowercase format
  // (backend returns ADD_DOCUMENT but expects add_document)
  const normalizeTrigger = (trigger: string): TriggerType => {
    const lowered = trigger.toLowerCase();
    if (
      lowered === "add_document" ||
      lowered === "edit_document" ||
      lowered === "new_thread" ||
      lowered === "new_message"
    ) {
      return lowered as TriggerType;
    }
    return "add_document"; // Default fallback
  };

  // Populate form when editing an existing action
  React.useEffect(() => {
    if (actionToEdit && open) {
      setName(actionToEdit.name);
      setTrigger(normalizeTrigger(actionToEdit.trigger));
      setDisabled(actionToEdit.disabled);
      setRunOnAllCorpuses(actionToEdit.runOnAllCorpuses);

      // In edit mode, always use existing agent mode (not inline creation)
      // since the action already has an agent configuration
      setUseInlineAgent(false);

      // Determine action type and set appropriate selection
      if (actionToEdit.agentConfig) {
        setActionType("agent");
        setSelectedAgentConfigId(actionToEdit.agentConfig.id);
        setAgentPrompt(actionToEdit.agentPrompt || "");
        setPreAuthorizedTools(actionToEdit.preAuthorizedTools || []);
        setSelectedFieldsetId(null);
        setSelectedAnalyzerId(null);
      } else if (actionToEdit.analyzer) {
        setActionType("analyzer");
        setSelectedAnalyzerId(actionToEdit.analyzer.id);
        setSelectedFieldsetId(null);
        setSelectedAgentConfigId(null);
      } else if (actionToEdit.fieldset) {
        setActionType("fieldset");
        setSelectedFieldsetId(actionToEdit.fieldset.id);
        setSelectedAnalyzerId(null);
        setSelectedAgentConfigId(null);
      }
    } else if (!open) {
      // Reset form when modal closes
      resetForm();
    }
  }, [actionToEdit, open]);

  const [createCorpusAction] = useMutation<
    CreateCorpusActionOutput,
    CreateCorpusActionInput
  >(CREATE_CORPUS_ACTION, {
    onCompleted: (data) => {
      if (data.createCorpusAction.ok) {
        toast.success("Action created successfully");
        setIsSubmitting(false);
        resetForm();
        onSuccess();
        onClose();
      } else {
        toast.error(
          data.createCorpusAction.message || "Failed to create action"
        );
        setIsSubmitting(false);
      }
    },
    onError: (error) => {
      toast.error("Failed to create action");
      console.error("Error creating corpus action:", error);
      setIsSubmitting(false);
    },
  });

  const [updateCorpusAction] = useMutation<
    UpdateCorpusActionOutput,
    UpdateCorpusActionInput
  >(UPDATE_CORPUS_ACTION, {
    onCompleted: (data) => {
      if (data.updateCorpusAction.ok) {
        toast.success("Action updated successfully");
        setIsSubmitting(false);
        resetForm();
        onSuccess();
        onClose();
      } else {
        toast.error(
          data.updateCorpusAction.message || "Failed to update action"
        );
        setIsSubmitting(false);
      }
    },
    onError: (error) => {
      toast.error("Failed to update action");
      console.error("Error updating corpus action:", error);
      setIsSubmitting(false);
    },
  });

  const { data: fieldsetsData } = useQuery<
    GetFieldsetsOutputs,
    GetFieldsetsInputs
  >(GET_FIELDSETS);

  const { data: analyzersData } = useQuery<
    GetAnalyzersOutputs,
    GetAnalyzersInputs
  >(GET_ANALYZERS);

  const { data: agentConfigsData } = useQuery<
    GetAgentConfigurationsOutput,
    GetAgentConfigurationsInput
  >(GET_AGENT_CONFIGURATIONS, {
    variables: { isActive: true },
  });

  // Get available tools from selected agent config
  const selectedAgentConfig = React.useMemo(() => {
    if (!selectedAgentConfigId || !agentConfigsData) return null;
    return agentConfigsData.agentConfigurations.edges.find(
      (edge) => edge.node.id === selectedAgentConfigId
    )?.node;
  }, [selectedAgentConfigId, agentConfigsData]);

  const handleSubmit = async () => {
    if (!name) {
      toast.error("Please enter a name for the action");
      return;
    }

    if (actionType === "fieldset" && !selectedFieldsetId) {
      toast.error("Please select a fieldset");
      return;
    }

    if (actionType === "analyzer" && !selectedAnalyzerId) {
      toast.error("Please select an analyzer");
      return;
    }

    if (actionType === "agent") {
      // Validation depends on whether we're using inline agent creation or existing agent
      if (isThreadTrigger && useInlineAgent) {
        // Inline agent creation mode
        if (!inlineAgentName.trim()) {
          toast.error("Please enter a name for the moderator agent");
          return;
        }
        if (!inlineAgentInstructions.trim()) {
          toast.error("Please enter system instructions for the agent");
          return;
        }
        if (!agentPrompt.trim()) {
          toast.error("Please enter a task prompt for the agent");
          return;
        }
        if (selectedModerationTools.length === 0) {
          toast.error("Please select at least one moderation tool");
          return;
        }
      } else {
        // Existing agent mode
        if (!selectedAgentConfigId) {
          toast.error("Please select an agent configuration");
          return;
        }
        if (!agentPrompt.trim()) {
          toast.error("Please enter a prompt for the agent");
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      if (isEditMode && actionToEdit) {
        // Update existing action (inline creation not supported in edit mode)
        await updateCorpusAction({
          variables: {
            id: actionToEdit.id,
            name,
            trigger,
            fieldsetId:
              actionType === "fieldset"
                ? selectedFieldsetId || undefined
                : undefined,
            analyzerId:
              actionType === "analyzer"
                ? selectedAnalyzerId || undefined
                : undefined,
            agentConfigId:
              actionType === "agent"
                ? selectedAgentConfigId || undefined
                : undefined,
            agentPrompt: actionType === "agent" ? agentPrompt : undefined,
            preAuthorizedTools:
              actionType === "agent" && preAuthorizedTools.length > 0
                ? preAuthorizedTools
                : undefined,
            disabled,
            runOnAllCorpuses,
          },
        });
      } else {
        // Create new action - handle inline agent creation if applicable
        const isInlineAgentCreation =
          actionType === "agent" && isThreadTrigger && useInlineAgent;

        await createCorpusAction({
          variables: {
            corpusId,
            name,
            trigger,
            fieldsetId:
              actionType === "fieldset"
                ? selectedFieldsetId || undefined
                : undefined,
            analyzerId:
              actionType === "analyzer"
                ? selectedAnalyzerId || undefined
                : undefined,
            // Use existing agent if not creating inline
            agentConfigId:
              actionType === "agent" && !isInlineAgentCreation
                ? selectedAgentConfigId || undefined
                : undefined,
            agentPrompt: actionType === "agent" ? agentPrompt : undefined,
            // For existing agents, use preAuthorizedTools; for inline, use selectedModerationTools
            preAuthorizedTools:
              actionType === "agent"
                ? isInlineAgentCreation
                  ? selectedModerationTools
                  : preAuthorizedTools.length > 0
                  ? preAuthorizedTools
                  : undefined
                : undefined,
            // Inline agent creation parameters
            createAgentInline: isInlineAgentCreation ? true : undefined,
            inlineAgentName: isInlineAgentCreation
              ? inlineAgentName
              : undefined,
            inlineAgentDescription: isInlineAgentCreation
              ? inlineAgentDescription || undefined
              : undefined,
            inlineAgentInstructions: isInlineAgentCreation
              ? inlineAgentInstructions
              : undefined,
            inlineAgentTools: isInlineAgentCreation
              ? selectedModerationTools
              : undefined,
            disabled,
            runOnAllCorpuses,
          },
        });
      }
    } catch (error) {
      // Error is handled by the mutation's onError callback
    }
  };

  const triggerOptions = [
    { key: "add", text: "On Document Add", value: "add_document" },
    { key: "edit", text: "On Document Edit", value: "edit_document" },
    { key: "new_thread", text: "On New Thread", value: "new_thread" },
    { key: "new_message", text: "On New Message", value: "new_message" },
  ];

  // Thread/message triggers only support agent-based actions
  const isThreadTrigger = trigger === "new_thread" || trigger === "new_message";

  const actionTypeOptions = [
    {
      key: "fieldset",
      text: "Fieldset (Extract data)",
      value: "fieldset",
      icon: "table",
    },
    {
      key: "analyzer",
      text: "Analyzer (Run analysis)",
      value: "analyzer",
      icon: "cogs",
    },
    {
      key: "agent",
      text: "Agent (AI-powered action)",
      value: "agent",
      icon: "microchip",
    },
  ];

  interface DropdownOption {
    key: string;
    text: string;
    value: string;
  }

  const fieldsetOptions: DropdownOption[] = React.useMemo(
    () =>
      fieldsetsData?.fieldsets.edges.map((fieldset) => ({
        key: fieldset.node.id,
        text: fieldset.node.name,
        value: fieldset.node.id,
      })) || [],
    [fieldsetsData]
  );

  const analyzerOptions: DropdownOption[] = React.useMemo(
    () =>
      analyzersData?.analyzers.edges.map((analyzer) => ({
        key: analyzer.node.id,
        text: analyzer.node.analyzerId || analyzer.node.id,
        value: analyzer.node.id,
      })) || [],
    [analyzersData]
  );

  const agentConfigOptions: DropdownOption[] = React.useMemo(
    () =>
      agentConfigsData?.agentConfigurations.edges.map((config) => ({
        key: config.node.id,
        text: `${config.node.name}${
          config.node.scope === "CORPUS" ? " (Corpus)" : " (Global)"
        }`,
        value: config.node.id,
      })) || [],
    [agentConfigsData]
  );

  const toolOptions: DropdownOption[] = React.useMemo(() => {
    if (!selectedAgentConfig?.availableTools) return [];
    return selectedAgentConfig.availableTools.map((tool) => ({
      key: tool,
      text: tool.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      value: tool,
    }));
  }, [selectedAgentConfig]);

  return (
    <Modal open={open} onClose={onClose} size="small">
      <Modal.Header>
        <Icon name={isEditMode ? "edit" : "lightning"} />{" "}
        {isEditMode ? "Edit Corpus Action" : "Create New Corpus Action"}
      </Modal.Header>
      <Modal.Content>
        <Form loading={isSubmitting}>
          <Form.Field required>
            <label>Name</label>
            <Form.Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter action name"
            />
          </Form.Field>

          <Form.Field required>
            <label>Trigger</label>
            <Dropdown
              selection
              options={triggerOptions}
              value={trigger}
              onChange={(_, data) => {
                const newTrigger = data.value as
                  | "add_document"
                  | "edit_document"
                  | "new_thread"
                  | "new_message";
                setTrigger(newTrigger);
                // Thread/message triggers only support agent-based actions
                if (
                  newTrigger === "new_thread" ||
                  newTrigger === "new_message"
                ) {
                  setActionType("agent");
                  setSelectedFieldsetId(null);
                  setSelectedAnalyzerId(null);
                  // Default to inline agent creation for thread triggers
                  setUseInlineAgent(true);
                  // Pre-fill inline agent name based on action name
                  setInlineAgentName(`${name || "Moderator"} Agent`);
                  setInlineAgentInstructions(DEFAULT_MODERATOR_INSTRUCTIONS);
                  setSelectedModerationTools(
                    MODERATION_TOOLS.map((t) => t.name)
                  );
                } else {
                  // For document triggers, reset to existing agent mode
                  setUseInlineAgent(false);
                }
              }}
            />
          </Form.Field>

          <Form.Field required>
            <label>Action Type</label>
            <Dropdown
              selection
              disabled={isThreadTrigger}
              options={actionTypeOptions}
              value={actionType}
              onChange={(_, data) => {
                setActionType(data.value as ActionType);
                // Clear selections when changing type
                setSelectedFieldsetId(null);
                setSelectedAnalyzerId(null);
                setSelectedAgentConfigId(null);
                setAgentPrompt("");
                setPreAuthorizedTools([]);
              }}
            />
            {isThreadTrigger && (
              <small
                style={{ color: "#666", marginTop: "0.5em", display: "block" }}
              >
                Thread/message triggers only support agent-based actions.
              </small>
            )}
          </Form.Field>

          {actionType === "fieldset" && (
            <Segment>
              <Header as="h4">
                <Icon name="table" />
                <Header.Content>Fieldset Configuration</Header.Content>
              </Header>
              <Message info size="small">
                Select a fieldset to automatically extract data from documents
                when they are {trigger === "add_document" ? "added" : "edited"}.
              </Message>
              <Form.Field required>
                <label>Fieldset</label>
                <Dropdown
                  selection
                  clearable
                  search
                  options={fieldsetOptions}
                  value={selectedFieldsetId || undefined}
                  onChange={(_, data) =>
                    setSelectedFieldsetId(data.value as string)
                  }
                  placeholder="Select fieldset"
                />
              </Form.Field>
            </Segment>
          )}

          {actionType === "analyzer" && (
            <Segment>
              <Header as="h4">
                <Icon name="cogs" />
                <Header.Content>Analyzer Configuration</Header.Content>
              </Header>
              <Message info size="small">
                Select an analyzer to automatically run analysis on documents
                when they are {trigger === "add_document" ? "added" : "edited"}.
              </Message>
              <Form.Field required>
                <label>Analyzer</label>
                <Dropdown
                  selection
                  clearable
                  search
                  options={analyzerOptions}
                  value={selectedAnalyzerId || undefined}
                  onChange={(_, data) =>
                    setSelectedAnalyzerId(data.value as string)
                  }
                  placeholder="Select analyzer"
                />
              </Form.Field>
            </Segment>
          )}

          {actionType === "agent" && (
            <Segment>
              <Header as="h4">
                <Icon name="microchip" />
                <Header.Content>Agent Configuration</Header.Content>
              </Header>

              {/* Thread/Message trigger: Show mode toggle for inline vs existing agent */}
              {isThreadTrigger && !isEditMode && (
                <>
                  <Message info size="small">
                    <p>
                      <Icon name="comments" />
                      Configure an AI agent for{" "}
                      <strong>automated moderation</strong>. The agent will
                      execute automatically when{" "}
                      {trigger === "new_thread"
                        ? "a new discussion thread is created"
                        : "a new message is posted to a thread"}{" "}
                      in this corpus.
                    </p>
                  </Message>

                  <Menu pointing secondary size="small">
                    <Menu.Item
                      name="Quick Create Moderator"
                      active={useInlineAgent}
                      onClick={() => setUseInlineAgent(true)}
                      icon="magic"
                    />
                    <Menu.Item
                      name="Use Existing Agent"
                      active={!useInlineAgent}
                      onClick={() => setUseInlineAgent(false)}
                      icon="linkify"
                    />
                  </Menu>

                  {/* Inline Agent Creation Mode */}
                  {useInlineAgent && (
                    <>
                      <Message positive size="small">
                        <Icon name="lightning" />
                        <strong>Quick Create:</strong> Creates a new moderator
                        agent with all moderation tools enabled.
                      </Message>

                      <Form.Field required>
                        <label>Agent Name</label>
                        <Form.Input
                          value={inlineAgentName}
                          onChange={(e) => setInlineAgentName(e.target.value)}
                          placeholder="e.g., Discussion Moderator"
                        />
                      </Form.Field>

                      <Form.Field>
                        <label>
                          Agent Description{" "}
                          <Label size="tiny" color="grey">
                            Optional
                          </Label>
                        </label>
                        <Form.Input
                          value={inlineAgentDescription}
                          onChange={(e) =>
                            setInlineAgentDescription(e.target.value)
                          }
                          placeholder="Brief description of this moderator's purpose"
                        />
                      </Form.Field>

                      <Form.Field required>
                        <label>System Instructions</label>
                        <TextArea
                          value={inlineAgentInstructions}
                          onChange={(e, data) =>
                            setInlineAgentInstructions(data.value as string)
                          }
                          placeholder="Instructions that define the agent's behavior and policies"
                          rows={4}
                        />
                        <small
                          style={{
                            color: "#666",
                            marginTop: "0.5em",
                            display: "block",
                          }}
                        >
                          These instructions define how the agent behaves and
                          what moderation policies it follows.
                        </small>
                      </Form.Field>

                      <Form.Field required>
                        <label>Agent Task Prompt</label>
                        <TextArea
                          value={agentPrompt}
                          onChange={(e, data) =>
                            setAgentPrompt(data.value as string)
                          }
                          placeholder="e.g., 'Review this thread/message for policy compliance and take appropriate action'"
                          rows={3}
                        />
                        <small
                          style={{
                            color: "#666",
                            marginTop: "0.5em",
                            display: "block",
                          }}
                        >
                          This prompt is sent to the agent each time the action
                          triggers.
                        </small>
                      </Form.Field>

                      <Form.Field required>
                        <label>
                          Moderation Tools{" "}
                          <Label size="tiny" color="green">
                            {selectedModerationTools.length} selected
                          </Label>
                        </label>
                        <div
                          style={{
                            background: "#f8f9fa",
                            borderRadius: "8px",
                            padding: "1rem",
                            border: "1px solid #e9ecef",
                          }}
                        >
                          {MODERATION_TOOLS.map((tool) => (
                            <div
                              key={tool.name}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "0.5rem 0",
                                borderBottom: "1px solid #e9ecef",
                              }}
                            >
                              <Checkbox
                                checked={selectedModerationTools.includes(
                                  tool.name
                                )}
                                onChange={(_, data) => {
                                  if (data.checked) {
                                    setSelectedModerationTools((prev) => [
                                      ...prev,
                                      tool.name,
                                    ]);
                                  } else {
                                    setSelectedModerationTools((prev) =>
                                      prev.filter((t) => t !== tool.name)
                                    );
                                  }
                                }}
                                label={
                                  <label
                                    style={{
                                      fontWeight: 500,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {tool.name.replace(/_/g, " ")}
                                    <span
                                      style={{
                                        color: "#666",
                                        fontWeight: 400,
                                        marginLeft: "0.5rem",
                                      }}
                                    >
                                      - {tool.description}
                                    </span>
                                  </label>
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: "0.5rem" }}>
                          <Button
                            type="button"
                            size="tiny"
                            onClick={() =>
                              setSelectedModerationTools(
                                MODERATION_TOOLS.map((t) => t.name)
                              )
                            }
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            size="tiny"
                            onClick={() => setSelectedModerationTools([])}
                          >
                            Clear All
                          </Button>
                        </div>
                      </Form.Field>
                    </>
                  )}

                  {/* Existing Agent Mode for Thread Triggers */}
                  {!useInlineAgent && (
                    <>
                      <Form.Field required>
                        <label>Agent</label>
                        <Dropdown
                          selection
                          clearable
                          search
                          options={agentConfigOptions}
                          value={selectedAgentConfigId || undefined}
                          onChange={(_, data) => {
                            setSelectedAgentConfigId(data.value as string);
                            setPreAuthorizedTools([]);
                          }}
                          placeholder="Select agent configuration"
                        />
                      </Form.Field>

                      {selectedAgentConfig && (
                        <>
                          <Message size="small">
                            <Message.Header>
                              {selectedAgentConfig.name}
                            </Message.Header>
                            <p>{selectedAgentConfig.description}</p>
                          </Message>

                          <Form.Field required>
                            <label>Agent Prompt</label>
                            <TextArea
                              value={agentPrompt}
                              onChange={(e, data) =>
                                setAgentPrompt(data.value as string)
                              }
                              placeholder="Enter the task prompt for the agent"
                              rows={4}
                            />
                          </Form.Field>

                          {toolOptions.length > 0 && (
                            <Form.Field>
                              <label>
                                Pre-authorized Tools{" "}
                                <Label size="tiny" color="blue">
                                  Optional
                                </Label>
                              </label>
                              <Dropdown
                                selection
                                multiple
                                search
                                options={toolOptions}
                                value={preAuthorizedTools}
                                onChange={(_, data) =>
                                  setPreAuthorizedTools(data.value as string[])
                                }
                                placeholder="Select tools to pre-authorize (optional)"
                              />
                            </Form.Field>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Document triggers OR edit mode: Show existing agent selection only */}
              {(!isThreadTrigger || isEditMode) && (
                <>
                  <Message info size="small">
                    <p>
                      Select an AI agent to perform custom actions on{" "}
                      <strong>individual documents</strong>. The agent will
                      execute automatically when documents are{" "}
                      {trigger === "add_document" ? "added" : "edited"}.
                    </p>
                    <p style={{ marginTop: "0.5em", marginBottom: 0 }}>
                      <Icon name="info circle" />
                      The agent will have access to document-scoped tools
                      (read/update description, summary, notes, annotations).
                    </p>
                  </Message>

                  <Form.Field required>
                    <label>Agent</label>
                    <Dropdown
                      selection
                      clearable
                      search
                      options={agentConfigOptions}
                      value={selectedAgentConfigId || undefined}
                      onChange={(_, data) => {
                        setSelectedAgentConfigId(data.value as string);
                        setPreAuthorizedTools([]);
                      }}
                      placeholder="Select agent configuration"
                    />
                  </Form.Field>

                  {selectedAgentConfig && (
                    <>
                      <Message size="small">
                        <Message.Header>
                          {selectedAgentConfig.name}
                        </Message.Header>
                        <p>{selectedAgentConfig.description}</p>
                      </Message>

                      <Form.Field required>
                        <label>Agent Prompt</label>
                        <TextArea
                          value={agentPrompt}
                          onChange={(e, data) =>
                            setAgentPrompt(data.value as string)
                          }
                          placeholder="Enter the task prompt for the agent (e.g., 'Summarize this document and update its description')"
                          rows={4}
                        />
                      </Form.Field>

                      {toolOptions.length > 0 && (
                        <Form.Field>
                          <label>
                            Pre-authorized Tools{" "}
                            <Label size="tiny" color="blue">
                              Optional
                            </Label>
                          </label>
                          <Dropdown
                            selection
                            multiple
                            search
                            options={toolOptions}
                            value={preAuthorizedTools}
                            onChange={(_, data) =>
                              setPreAuthorizedTools(data.value as string[])
                            }
                            placeholder="Select tools to pre-authorize (optional)"
                          />
                          <small
                            style={{
                              color: "#666",
                              marginTop: "0.5em",
                              display: "block",
                            }}
                          >
                            Pre-authorized tools will execute without requiring
                            approval. Leave empty to use all available tools
                            with approval gates.
                          </small>
                        </Form.Field>
                      )}
                    </>
                  )}
                </>
              )}
            </Segment>
          )}

          <Form.Field>
            <Form.Checkbox
              label="Initially Disabled"
              checked={disabled}
              onChange={(_, data) => setDisabled(data.checked || false)}
            />
          </Form.Field>

          <Form.Field>
            <Form.Checkbox
              label="Run on All Corpuses"
              checked={runOnAllCorpuses}
              onChange={(_, data) => setRunOnAllCorpuses(data.checked || false)}
            />
          </Form.Field>
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button
          onClick={() => {
            resetForm();
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button primary onClick={handleSubmit} loading={isSubmitting}>
          {isEditMode ? "Update Action" : "Create Action"}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
