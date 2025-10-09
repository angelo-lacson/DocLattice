import { Menu, Image, Icon, Label } from "semantic-ui-react";
import { Link } from "react-router-dom";
import Dropdown from "../common/Dropdown";

import logo from "../../assets/images/os_legal_128.png";
import user_logo from "../../assets/icons/noun-person-113116-FFFFFF.png";
import { showExportModal, showUserSettingsModal } from "../../graphql/cache";
import UserSettingsModal from "../modals/UserSettingsModal";
import { useReactiveVar } from "@apollo/client";
import { VERSION_TAG } from "../../assets/configurations/constants";
import { useNavMenu } from "./useNavMenu";

export const NavMenu = () => {
  const {
    user,
    isLoading,
    REACT_APP_USE_AUTH0,
    public_header_items,
    private_header_items,
    show_export_modal,
    pathname,
    isActive: getIsActive,
    requestLogout,
    doLogin,
  } = useNavMenu();

  // Note: CentralRouteManager automatically clears openedCorpus/openedDocument when navigating
  // No need to manually clear on menu clicks

  const items = public_header_items.map((item) => (
    <Menu.Item
      id={item.id}
      name={item.title}
      active={getIsActive(item.route)}
      key={`${item.title}`}
      as={Link}
      to={item.route}
    >
      {item.title}
    </Menu.Item>
  ));

  const private_items = private_header_items.map((item) => (
    <Menu.Item
      id={item.id}
      name={item.title}
      active={getIsActive(item.route)}
      key={`${item.title}`}
      as={Link}
      to={item.route}
    >
      {item.title}
    </Menu.Item>
  ));

  if (REACT_APP_USE_AUTH0) {
    return (
      <>
        <UserSettingsModal />
        <Menu fluid inverted attached style={{ marginBottom: "0px" }}>
          <Menu.Item header>
            <Image size="mini" src={logo} style={{ marginRight: "1.5em" }} />
            Open Contracts
            <Label
              size="tiny"
              color="grey"
              style={{ marginLeft: "0.5em", verticalAlign: "middle" }}
            >
              {VERSION_TAG}
            </Label>
          </Menu.Item>
          {!isLoading && user ? [...items, ...private_items] : items}
          <Menu.Menu position="right">
            {!isLoading && user ? (
              <>
                <Menu.Item>
                  <Image src={user_logo} avatar />
                  <Dropdown
                    item
                    simple
                    icon={
                      <Icon style={{ marginLeft: "5px" }} name="dropdown" />
                    }
                    text={` ${user?.name ? user.name : user.username}`}
                    style={{ margin: "0px", padding: "0px" }}
                    header="Logout"
                  >
                    <Dropdown.Menu>
                      <Dropdown.Item
                        text="Exports"
                        onClick={() => showExportModal(!show_export_modal)}
                        icon={<Icon name="download" />}
                      />
                      <Dropdown.Item
                        text="Profile"
                        onClick={() => showUserSettingsModal(true)}
                        icon={<Icon name="user circle" />}
                      />
                      <Dropdown.Item
                        text="Logout"
                        onClick={() => requestLogout()}
                        icon={<Icon name="log out" />}
                      />
                      {/* <Dropdown.Item 
                                            text='Settings'
                                            onClick={() => console.log("Do nothing yet...")}
                                            icon={<Icon name='settings'/>}
                                        /> */}
                    </Dropdown.Menu>
                  </Dropdown>
                </Menu.Item>
              </>
            ) : (
              <Menu.Item onClick={doLogin}>Login</Menu.Item>
            )}
          </Menu.Menu>
        </Menu>
      </>
    );
  } else {
    return (
      <>
        <UserSettingsModal />
        <Menu fluid inverted attached style={{ marginBottom: "0px" }}>
          <Menu.Item header>
            <Image size="mini" src={logo} style={{ marginRight: "1.5em" }} />
            Open Contracts
            <Label
              size="tiny"
              color="grey"
              style={{ marginLeft: "0.5em", verticalAlign: "middle" }}
            >
              {VERSION_TAG}
            </Label>
          </Menu.Item>
          {user ? [...items, ...private_items] : items}
          <Menu.Menu position="right">
            {user ? (
              <>
                <Menu.Item>
                  <Image src={user_logo} avatar />
                  <Dropdown
                    item
                    simple
                    icon={
                      <Icon style={{ marginLeft: "5px" }} name="dropdown" />
                    }
                    text={` ${user?.name ? user.name : user.username}`}
                    style={{ margin: "0px", padding: "0px" }}
                    header="Logout"
                  >
                    <Dropdown.Menu>
                      <Dropdown.Item
                        text="Exports"
                        onClick={() => showExportModal(!show_export_modal)}
                        icon={<Icon name="download" />}
                      />
                      <Dropdown.Item
                        text="Profile"
                        onClick={() => showUserSettingsModal(true)}
                        icon={<Icon name="user circle" />}
                      />
                      <Dropdown.Item
                        text="Logout"
                        onClick={() => requestLogout()}
                        icon={<Icon name="log out" />}
                      />
                      {/* <Dropdown.Item 
                                            text='Settings'
                                            onClick={() => console.log("Do nothing yet...")}
                                            icon={<Icon name='settings'/>}
                                        /> */}
                    </Dropdown.Menu>
                  </Dropdown>
                </Menu.Item>
              </>
            ) : (
              <Menu.Item
                id="login_nav_button"
                name="Login"
                active={pathname === "/login"}
                key="login_nav_button"
                as={Link}
                to="/login"
              >
                Login
              </Menu.Item>
            )}
          </Menu.Menu>
        </Menu>
      </>
    );
  }
};
