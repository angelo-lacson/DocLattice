import React, { useState } from "react";
import { gql, useQuery, useMutation, useReactiveVar } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Table,
  Message,
  Dimmer,
  Loader,
  Modal,
  Form,
  Input,
  TextArea,
  Confirm,
} from "semantic-ui-react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { Upload, ArrowLeft } from "lucide-react";

import {
  OS_LEGAL_COLORS,
  OS_LEGAL_TYPOGRAPHY,
  OS_LEGAL_SPACING,
} from "../../assets/configurations/osLegalStyles";
import { backendUserObj } from "../../graphql/cache";

// ---------------------------------------------------------------------------
// GraphQL operations
// ---------------------------------------------------------------------------

const GET_WORKER_ACCOUNTS = gql`
  query GetWorkerAccounts {
    workerAccounts {
      id
      name
      description
      isActive
      tokenCount
      creatorName
      created
    }
  }
`;

const CREATE_WORKER_ACCOUNT = gql`
  mutation CreateWorkerAccount($name: String!, $description: String) {
    createWorkerAccount(name: $name, description: $description) {
      ok
      workerAccount {
        id
        name
        description
        isActive
        created
      }
    }
  }
`;

const DEACTIVATE_WORKER_ACCOUNT = gql`
  mutation DeactivateWorkerAccount($workerAccountId: Int!) {
    deactivateWorkerAccount(workerAccountId: $workerAccountId) {
      ok
    }
  }
`;

const REACTIVATE_WORKER_ACCOUNT = gql`
  mutation ReactivateWorkerAccount($workerAccountId: Int!) {
    reactivateWorkerAccount(workerAccountId: $workerAccountId) {
      ok
    }
  }
`;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const BackLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.875rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  margin-bottom: 1.5rem;
  transition: color 0.15s ease;

  &:hover {
    color: ${OS_LEGAL_COLORS.accent};
  }
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
`;

const PageTitleGroup = styled.div``;

const PageTitle = styled.h1`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySerif};
  font-size: 1.75rem;
  font-weight: 700;
  color: ${OS_LEGAL_COLORS.textPrimary};
  margin: 0 0 0.5rem 0;
`;

const PageSubtitle = styled.p`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-size: 1rem;
  margin: 0;
  line-height: 1.5;
`;

const StyledSegment = styled.div`
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusCard};
  box-shadow: ${OS_LEGAL_SPACING.shadowCard};
  padding: 1.5rem;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $active }) => ($active ? "#dcfce7" : "#fee2e2")};
  color: ${({ $active }) => ($active ? "#166534" : "#991b1b")};
`;

const TruncatedCell = styled.span`
  display: inline-block;
  max-width: 250px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkerAccount {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  tokenCount: number;
  creatorName: string;
  created: string;
}

interface FormState {
  name: string;
  description: string;
}

const initialFormState: FormState = {
  name: "",
  description: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WorkerAccountManagement: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useReactiveVar(backendUserObj);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [accountToDeactivate, setAccountToDeactivate] =
    useState<WorkerAccount | null>(null);

  const isSuperuser = currentUser?.isSuperuser === true;

  const { loading, error, data, refetch } = useQuery(GET_WORKER_ACCOUNTS, {
    skip: !isSuperuser,
  });

  const [createAccount, { loading: creating }] = useMutation(
    CREATE_WORKER_ACCOUNT,
    {
      onCompleted: (result) => {
        if (result.createWorkerAccount.ok) {
          toast.success("Worker account created successfully");
          setShowCreateModal(false);
          setFormState(initialFormState);
          refetch();
        } else {
          toast.error("Failed to create worker account");
        }
      },
      onError: (err) => toast.error(err.message),
    }
  );

  const [deactivateAccount] = useMutation(DEACTIVATE_WORKER_ACCOUNT, {
    onCompleted: (result) => {
      if (result.deactivateWorkerAccount.ok) {
        toast.success("Worker account deactivated");
        refetch();
      } else {
        toast.error("Failed to deactivate worker account");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const [reactivateAccount] = useMutation(REACTIVATE_WORKER_ACCOUNT, {
    onCompleted: (result) => {
      if (result.reactivateWorkerAccount.ok) {
        toast.success("Worker account reactivated");
        refetch();
      } else {
        toast.error("Failed to reactivate worker account");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    createAccount({
      variables: {
        name: formState.name,
        description: formState.description || null,
      },
    });
  };

  const handleToggleActive = (account: WorkerAccount) => {
    if (account.isActive) {
      setAccountToDeactivate(account);
    } else {
      reactivateAccount({
        variables: { workerAccountId: account.id },
      });
    }
  };

  const handleConfirmDeactivate = () => {
    if (accountToDeactivate) {
      deactivateAccount({
        variables: { workerAccountId: accountToDeactivate.id },
      });
      setAccountToDeactivate(null);
    }
  };

  const accounts: WorkerAccount[] = data?.workerAccounts ?? [];

  if (!isSuperuser) {
    return (
      <Container>
        <Message warning>
          <Message.Header>Access Denied</Message.Header>
          <p>Only administrators can manage worker accounts.</p>
        </Message>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <Dimmer active inverted>
          <Loader>Loading worker accounts...</Loader>
        </Dimmer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Message negative>
          <Message.Header>Error loading worker accounts</Message.Header>
          <p>{error.message}</p>
        </Message>
      </Container>
    );
  }

  return (
    <Container>
      <BackLink onClick={() => navigate("/admin/settings")}>
        <ArrowLeft size={14} />
        Back to Admin Settings
      </BackLink>

      <PageHeader>
        <PageTitleGroup>
          <PageTitle>
            <Upload size={28} color={OS_LEGAL_COLORS.accent} />
            Worker Accounts
          </PageTitle>
          <PageSubtitle>
            Manage service accounts used by automated pipelines to upload and
            process documents.
          </PageSubtitle>
        </PageTitleGroup>
        <Button
          primary
          onClick={() => {
            setFormState(initialFormState);
            setShowCreateModal(true);
          }}
        >
          Create Account
        </Button>
      </PageHeader>

      <StyledSegment>
        {accounts.length === 0 ? (
          <Message info>
            <Message.Header>No Worker Accounts</Message.Header>
            <p>
              Create your first worker account to enable automated document
              upload pipelines.
            </p>
          </Message>
        ) : (
          <Table basic="very" celled>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Description</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Tokens</Table.HeaderCell>
                <Table.HeaderCell>Creator</Table.HeaderCell>
                <Table.HeaderCell>Created</Table.HeaderCell>
                <Table.HeaderCell>Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {accounts.map((account) => (
                <Table.Row key={account.id}>
                  <Table.Cell>
                    <strong>{account.name}</strong>
                  </Table.Cell>
                  <Table.Cell>
                    <TruncatedCell>{account.description || "-"}</TruncatedCell>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge $active={account.isActive}>
                      {account.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell>{account.tokenCount}</Table.Cell>
                  <Table.Cell>{account.creatorName}</Table.Cell>
                  <Table.Cell>
                    {new Date(account.created).toLocaleDateString()}
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      size="tiny"
                      color={account.isActive ? "red" : "green"}
                      onClick={() => handleToggleActive(account)}
                    >
                      {account.isActive ? "Deactivate" : "Activate"}
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
        size="small"
      >
        <Modal.Header>Create Worker Account</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Field required>
              <label>Name</label>
              <Input
                placeholder="Worker account name"
                value={formState.name}
                onChange={(e) =>
                  setFormState({ ...formState, name: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Description</label>
              <TextArea
                placeholder="Optional description of this worker account"
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                rows={3}
              />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowCreateModal(false)}>Cancel</Button>
          <Button
            primary
            loading={creating}
            disabled={!formState.name || creating}
            onClick={handleCreate}
          >
            Create Account
          </Button>
        </Modal.Actions>
      </Modal>

      {/* Deactivate Confirmation */}
      <Confirm
        open={accountToDeactivate !== null}
        onCancel={() => setAccountToDeactivate(null)}
        onConfirm={handleConfirmDeactivate}
        content={`Are you sure you want to deactivate "${accountToDeactivate?.name}"? This will invalidate all access tokens for this account.`}
        confirmButton="Deactivate"
        cancelButton="Cancel"
      />
    </Container>
  );
};

export default WorkerAccountManagement;
