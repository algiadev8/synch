import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrganizationsPage } from "../src/pages/organizations";
import { english, json, loading, failure, organization } from "./mocks";

const meta = {
  title: "Pages/Organizations",
  loaders: [english("organizations")],
  render: (_, { loaded }) => <OrganizationsPage t={loaded.t} locale="en" />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Owner: Story = {};
export const Admin: Story = {
  parameters: {
    msw: {
      handlers: [
        json("/v1/organizations/studio", { ...organization, role: "admin" }),
      ],
    },
  },
};
export const Loading: Story = {
  parameters: { msw: { handlers: [loading("/v1/organizations")] } },
};
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        json("/v1/organizations/studio", {
          ...organization,
          members: organization.members.slice(0, 1),
          invitations: [],
          vaults: [],
        }),
      ],
    },
  },
};
export const Error: Story = {
  parameters: { msw: { handlers: [failure("/v1/organizations")] } },
};
export const SharingSuspended: Story = {
  parameters: {
    msw: {
      handlers: [
        json("/v1/organizations/studio", {
          ...organization,
          sharing: { enabled: false },
        }),
      ],
    },
  },
};
