import React, { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import {
  Button,
  Table,
  Header,
  Message,
  Dimmer,
  Loader,
  Segment,
  Icon,
  Modal,
  Form,
  Input,
  TextArea,
  Checkbox,
  Label,
} from "semantic-ui-react";
import styled from "styled-components";
import { gql } from "@apollo/client";
import { toast } from "react-toastify";
import { ConfirmModal } from "../widgets/modals/ConfirmModal";
import { AgentConfigurationType } from "../../types/graphql-api";

// GraphQL Queries and Mutations
const GET_GLOBAL_AGENTS = gql`
  query GetGlobalAgents {
    agentConfigurations(scope: "GLOBAL") {
      edges {
        node {
          id
          name
          slug
          description
          systemInstructions
          availableTools
          permissionRequiredTools
          badgeConfig
          avatarUrl
          scope
          isActive
          isPublic
          creator {
            id
            username
          }
          created
          modified
        }
      }
    }
  }
`;

const CREATE_AGENT_CONFIGURATION = gql`
  mutation CreateAgentConfiguration(
    $name: String!
    $description: String!
    $systemInstructions: String!
    $availableTools: [String]
    $permissionRequiredTools: [String]
    $badgeConfig: JSONString
    $avatarUrl: String
    $scope: String!
    $isPublic: Boolean
  ) {
    createAgentConfiguration(
      name: $name
      description: $description
      systemInstructions: $systemInstructions
      availableTools: $availableTools
      permissionRequiredTools: $permissionRequiredTools
      badgeConfig: $badgeConfig
      avatarUrl: $avatarUrl
      scope: $scope
      isPublic: $isPublic
    ) {
      ok
      message
      agent {
        id
        name
        slug
        description
      }
    }
  }
`;

const UPDATE_AGENT_CONFIGURATION = gql`
  mutation UpdateAgentConfiguration(
    $agentId: ID!
    $name: String
    $description: String
    $systemInstructions: String
    $availableTools: [String]
    $permissionRequiredTools: [String]
    $badgeConfig: JSONString
    $avatarUrl: String
    $isActive: Boolean
    $isPublic: Boolean
  ) {
    updateAgentConfiguration(
      agentId: $agentId
      name: $name
      description: $description
      systemInstructions: $systemInstructions
      availableTools: $availableTools
      permissionRequiredTools: $permissionRequiredTools
      badgeConfig: $badgeConfig
      avatarUrl: $avatarUrl
      isActive: $isActive
      isPublic: $isPublic
    ) {
      ok
      message
      agent {
        id
        name
        slug
        description
      }
    }
  }
`;

const DELETE_AGENT_CONFIGURATION = gql`
  mutation DeleteAgentConfiguration($agentId: ID!) {
    deleteAgentConfiguration(agentId: $agentId) {
      ok
      message
    }
  }
`;

const Container = styled.div`
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
`;

const PageTitle = styled(Header)`
  &.ui.header {
    margin: 0;
    color: #1e293b;
  }
`;

const StyledSegment = styled(Segment)`
  &.ui.segment {
    border-radius: 12px;
    background: white;
    border: 1px solid rgba(226, 232, 240, 0.8);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }
`;

const StatusBadge = styled(Label)<{ $active: boolean }>`
  &.ui.label {
    background: ${(props) => (props.$active ? "#dcfce7" : "#fef3c7")};
    color: ${(props) => (props.$active ? "#166534" : "#92400e")};
    font-weight: 500;
  }
`;

const ToolsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const ToolBadge = styled(Label)`
  &.ui.label {
    font-size: 0.75rem;
    background: #f1f5f9;
    color: #475569;
  }
`;

interface AgentNode {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  systemInstructions: string;
  availableTools?: string[];
  permissionRequiredTools?: string[];
  badgeConfig?: Record<string, any>;
  avatarUrl?: string;
  scope: string;
  isActive: boolean;
  isPublic?: boolean;
  creator: { id: string; username: string };
  created: string;
  modified: string;
}

interface FormState {
  name: string;
  description: string;
  systemInstructions: string;
  availableTools: string;
  permissionRequiredTools: string;
  badgeConfig: string;
  avatarUrl: string;
  isPublic: boolean;
  isActive: boolean;
}

const initialFormState: FormState = {
  name: "",
  description: "",
  systemInstructions: "",
  availableTools: "",
  permissionRequiredTools: "",
  badgeConfig: '{"icon": "robot", "color": "#6366f1", "label": "AI"}',
  avatarUrl: "",
  isPublic: true,
  isActive: true,
};

export const GlobalAgentManagement: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AgentNode | null>(null);
  const [agentToEdit, setAgentToEdit] = useState<AgentNode | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);

  const { loading, error, data, refetch } = useQuery(GET_GLOBAL_AGENTS);

  const [createAgent, { loading: creating }] = useMutation(
    CREATE_AGENT_CONFIGURATION,
    {
      onCompleted: (data) => {
        if (data.createAgentConfiguration.ok) {
          toast.success("Agent created successfully");
          setShowCreateModal(false);
          setFormState(initialFormState);
          refetch();
        } else {
          toast.error(data.createAgentConfiguration.message);
        }
      },
      onError: (err) => toast.error(err.message),
    }
  );

  const [updateAgent, { loading: updating }] = useMutation(
    UPDATE_AGENT_CONFIGURATION,
    {
      onCompleted: (data) => {
        if (data.updateAgentConfiguration.ok) {
          toast.success("Agent updated successfully");
          setShowEditModal(false);
          setAgentToEdit(null);
          refetch();
        } else {
          toast.error(data.updateAgentConfiguration.message);
        }
      },
      onError: (err) => toast.error(err.message),
    }
  );

  const [deleteAgent, { loading: deleting }] = useMutation(
    DELETE_AGENT_CONFIGURATION,
    {
      onCompleted: (data) => {
        if (data.deleteAgentConfiguration.ok) {
          toast.success("Agent deleted successfully");
          setDeleteModalOpen(false);
          setAgentToDelete(null);
          refetch();
        } else {
          toast.error(data.deleteAgentConfiguration.message);
        }
      },
      onError: (err) => toast.error(err.message),
    }
  );

  const handleCreate = () => {
    const tools = formState.availableTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const permTools = formState.permissionRequiredTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    let badgeConfig = {};
    try {
      badgeConfig = JSON.parse(formState.badgeConfig || "{}");
    } catch (e) {
      toast.error("Invalid badge config JSON");
      return;
    }

    createAgent({
      variables: {
        name: formState.name,
        description: formState.description,
        systemInstructions: formState.systemInstructions,
        availableTools: tools.length > 0 ? tools : null,
        permissionRequiredTools: permTools.length > 0 ? permTools : null,
        badgeConfig: JSON.stringify(badgeConfig),
        avatarUrl: formState.avatarUrl || null,
        scope: "GLOBAL",
        isPublic: formState.isPublic,
      },
    });
  };

  const handleUpdate = () => {
    if (!agentToEdit) return;

    const tools = formState.availableTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const permTools = formState.permissionRequiredTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    let badgeConfig = {};
    try {
      badgeConfig = JSON.parse(formState.badgeConfig || "{}");
    } catch (e) {
      toast.error("Invalid badge config JSON");
      return;
    }

    updateAgent({
      variables: {
        agentId: agentToEdit.id,
        name: formState.name,
        description: formState.description,
        systemInstructions: formState.systemInstructions,
        availableTools: tools,
        permissionRequiredTools: permTools,
        badgeConfig: JSON.stringify(badgeConfig),
        avatarUrl: formState.avatarUrl || null,
        isActive: formState.isActive,
        isPublic: formState.isPublic,
      },
    });
  };

  const openEditModal = (agent: AgentNode) => {
    setAgentToEdit(agent);
    setFormState({
      name: agent.name,
      description: agent.description || "",
      systemInstructions: agent.systemInstructions,
      availableTools: (agent.availableTools || []).join(", "),
      permissionRequiredTools: (agent.permissionRequiredTools || []).join(", "),
      badgeConfig: JSON.stringify(agent.badgeConfig || {}, null, 2),
      avatarUrl: agent.avatarUrl || "",
      isPublic: agent.isPublic ?? true,
      isActive: agent.isActive,
    });
    setShowEditModal(true);
  };

  const agents: AgentNode[] =
    data?.agentConfigurations?.edges?.map((e: any) => e.node) || [];

  if (loading) {
    return (
      <Container>
        <Dimmer active inverted>
          <Loader>Loading agents...</Loader>
        </Dimmer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Message negative>
          <Message.Header>Error loading agents</Message.Header>
          <p>{error.message}</p>
        </Message>
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader>
        <PageTitle as="h1">
          <Icon name="microchip" /> Global Agent Management
        </PageTitle>
        <Button
          primary
          icon
          labelPosition="left"
          onClick={() => {
            setFormState(initialFormState);
            setShowCreateModal(true);
          }}
        >
          <Icon name="plus" />
          Create Agent
        </Button>
      </PageHeader>

      <StyledSegment>
        {agents.length === 0 ? (
          <Message info>
            <Message.Header>No Global Agents</Message.Header>
            <p>
              Create your first global agent to make it available across all
              corpuses.
            </p>
          </Message>
        ) : (
          <Table basic="very" celled>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Slug</Table.HeaderCell>
                <Table.HeaderCell>Description</Table.HeaderCell>
                <Table.HeaderCell>Tools</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {agents.map((agent) => (
                <Table.Row key={agent.id}>
                  <Table.Cell>
                    <strong>{agent.name}</strong>
                  </Table.Cell>
                  <Table.Cell>
                    <code>{agent.slug || "-"}</code>
                  </Table.Cell>
                  <Table.Cell>
                    {agent.description?.substring(0, 100)}
                    {(agent.description?.length || 0) > 100 ? "..." : ""}
                  </Table.Cell>
                  <Table.Cell>
                    <ToolsList>
                      {(agent.availableTools || []).slice(0, 3).map((tool) => (
                        <ToolBadge key={tool} size="tiny">
                          {tool}
                        </ToolBadge>
                      ))}
                      {(agent.availableTools || []).length > 3 && (
                        <ToolBadge size="tiny">
                          +{(agent.availableTools || []).length - 3}
                        </ToolBadge>
                      )}
                    </ToolsList>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge $active={agent.isActive}>
                      {agent.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      icon
                      size="tiny"
                      onClick={() => openEditModal(agent)}
                    >
                      <Icon name="edit" />
                    </Button>
                    <Button
                      icon
                      size="tiny"
                      negative
                      onClick={() => {
                        setAgentToDelete(agent);
                        setDeleteModalOpen(true);
                      }}
                    >
                      <Icon name="trash" />
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </StyledSegment>

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        size="large"
      >
        <Modal.Header>Create Global Agent</Modal.Header>
        <Modal.Content scrolling>
          <Form>
            <Form.Field required>
              <label>Name</label>
              <Input
                placeholder="Agent name"
                value={formState.name}
                onChange={(e) =>
                  setFormState({ ...formState, name: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field required>
              <label>Description</label>
              <TextArea
                placeholder="Brief description of what this agent does"
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                rows={2}
              />
            </Form.Field>
            <Form.Field required>
              <label>System Instructions</label>
              <TextArea
                placeholder="System prompt for the agent..."
                value={formState.systemInstructions}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    systemInstructions: e.target.value,
                  })
                }
                rows={6}
                style={{ fontFamily: "monospace" }}
              />
            </Form.Field>
            <Form.Field>
              <label>Available Tools (comma-separated)</label>
              <Input
                placeholder="similarity_search, load_document_text, search_exact_text"
                value={formState.availableTools}
                onChange={(e) =>
                  setFormState({ ...formState, availableTools: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Permission Required Tools (comma-separated)</label>
              <Input
                placeholder="Tools that require explicit permission"
                value={formState.permissionRequiredTools}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    permissionRequiredTools: e.target.value,
                  })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Badge Config (JSON)</label>
              <TextArea
                placeholder='{"icon": "robot", "color": "#6366f1", "label": "AI"}'
                value={formState.badgeConfig}
                onChange={(e) =>
                  setFormState({ ...formState, badgeConfig: e.target.value })
                }
                rows={3}
                style={{ fontFamily: "monospace" }}
              />
            </Form.Field>
            <Form.Field>
              <label>Avatar URL</label>
              <Input
                placeholder="https://example.com/avatar.png"
                value={formState.avatarUrl}
                onChange={(e) =>
                  setFormState({ ...formState, avatarUrl: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <Checkbox
                label="Publicly visible"
                checked={formState.isPublic}
                onChange={(_, data) =>
                  setFormState({ ...formState, isPublic: !!data.checked })
                }
              />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowCreateModal(false)}>Cancel</Button>
          <Button
            primary
            loading={creating}
            disabled={
              !formState.name ||
              !formState.description ||
              !formState.systemInstructions
            }
            onClick={handleCreate}
          >
            Create Agent
          </Button>
        </Modal.Actions>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        size="large"
      >
        <Modal.Header>Edit Agent: {agentToEdit?.name}</Modal.Header>
        <Modal.Content scrolling>
          <Form>
            <Form.Field required>
              <label>Name</label>
              <Input
                placeholder="Agent name"
                value={formState.name}
                onChange={(e) =>
                  setFormState({ ...formState, name: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field required>
              <label>Description</label>
              <TextArea
                placeholder="Brief description of what this agent does"
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                rows={2}
              />
            </Form.Field>
            <Form.Field required>
              <label>System Instructions</label>
              <TextArea
                placeholder="System prompt for the agent..."
                value={formState.systemInstructions}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    systemInstructions: e.target.value,
                  })
                }
                rows={6}
                style={{ fontFamily: "monospace" }}
              />
            </Form.Field>
            <Form.Field>
              <label>Available Tools (comma-separated)</label>
              <Input
                placeholder="similarity_search, load_document_text, search_exact_text"
                value={formState.availableTools}
                onChange={(e) =>
                  setFormState({ ...formState, availableTools: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Permission Required Tools (comma-separated)</label>
              <Input
                placeholder="Tools that require explicit permission"
                value={formState.permissionRequiredTools}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    permissionRequiredTools: e.target.value,
                  })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Badge Config (JSON)</label>
              <TextArea
                placeholder='{"icon": "robot", "color": "#6366f1", "label": "AI"}'
                value={formState.badgeConfig}
                onChange={(e) =>
                  setFormState({ ...formState, badgeConfig: e.target.value })
                }
                rows={3}
                style={{ fontFamily: "monospace" }}
              />
            </Form.Field>
            <Form.Field>
              <label>Avatar URL</label>
              <Input
                placeholder="https://example.com/avatar.png"
                value={formState.avatarUrl}
                onChange={(e) =>
                  setFormState({ ...formState, avatarUrl: e.target.value })
                }
              />
            </Form.Field>
            <Form.Group>
              <Form.Field>
                <Checkbox
                  label="Active"
                  checked={formState.isActive}
                  onChange={(_, data) =>
                    setFormState({ ...formState, isActive: !!data.checked })
                  }
                />
              </Form.Field>
              <Form.Field>
                <Checkbox
                  label="Publicly visible"
                  checked={formState.isPublic}
                  onChange={(_, data) =>
                    setFormState({ ...formState, isPublic: !!data.checked })
                  }
                />
              </Form.Field>
            </Form.Group>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowEditModal(false)}>Cancel</Button>
          <Button
            primary
            loading={updating}
            disabled={
              !formState.name ||
              !formState.description ||
              !formState.systemInstructions
            }
            onClick={handleUpdate}
          >
            Save Changes
          </Button>
        </Modal.Actions>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        visible={deleteModalOpen}
        message={`Are you sure you want to delete the agent "${agentToDelete?.name}"? This action cannot be undone.`}
        yesAction={() => {
          if (agentToDelete) {
            deleteAgent({ variables: { agentId: agentToDelete.id } });
          }
        }}
        noAction={() => {
          setDeleteModalOpen(false);
          setAgentToDelete(null);
        }}
        toggleModal={() => setDeleteModalOpen(false)}
      />
    </Container>
  );
};

export default GlobalAgentManagement;
