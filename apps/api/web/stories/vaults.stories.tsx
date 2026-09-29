import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { VaultsPage } from "../src/pages/vaults";
import { english, json, loading, failure, vaults } from "./mocks";

const meta = {
  title: "Pages/Vaults",
  loaders: [english("vaults")],
  render: (_, { loaded }) => <VaultsPage t={loaded.t} locale="en" />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Loading: Story = {
  parameters: { msw: { handlers: [loading("/v1/organizations")] } },
};
export const Empty: Story = {
  parameters: { msw: { handlers: [json("/v1/vaults", { vaults: [] })] } },
};
export const Error: Story = {
  parameters: { msw: { handlers: [failure("/v1/vaults")] } },
};
export const DeletionStates: Story = {
  parameters: {
    msw: {
      handlers: [
        json("/v1/vaults", {
          vaults: [
            { ...vaults[0], deletionStatus: "queued" },
            { ...vaults[0], id: "running", name: "Old archive", deletionStatus: "running" },
            {
              ...vaults[1],
              deletionStatus: "failed",
              deletionError: "Deletion could not finish. Please try again.",
            },
          ],
        }),
      ],
    },
  },
};
export const CreateDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Personal notes");
    await userEvent.click(canvas.getByRole("button", { name: "Create vault" }));
  },
};
export const DeleteDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Personal notes");
    await userEvent.click(canvas.getAllByRole("button", { name: "Delete" })[0]);
  },
};

export const NoManagedOrganization: Story = {
  parameters: { msw: { handlers: [json("/v1/organizations", {
    organizations: [{ id: "member-only", name: "Shared team", role: "member" }],
  })] } },
};
export const LongNames: Story = {
  parameters: { msw: { handlers: [json("/v1/vaults", {
    vaults: [{ ...vaults[0], name: "Research-archive-and-shared-project-documentation-with-a-very-long-unbroken-name" }],
  })] } },
};
export const Mobile: Story = {
  ...DeletionStates,
  globals: { viewport: { value: "mobile", isRotated: false } },
};
