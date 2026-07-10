{
  description = "TattooWarp — curvature-mapping tattoo design app (dev/build environment)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };

        # Shared libraries Electron's own (npm-downloaded) binary dynamically
        # links against at runtime. Needed so `npm run electron:dev` and the
        # unpacked `release/linux-unpacked/tattoowarp` binary can actually
        # launch on NixOS, which has no standard FHS layout at /lib, /usr/lib
        # etc. for a generic prebuilt ELF to find these against.
        electronRuntimeLibs = with pkgs; [
          nss
          nspr
          atk
          at-spi2-atk
          at-spi2-core
          cups
          dbus
          expat
          gtk3
          pango
          cairo
          gdk-pixbuf
          glib
          alsa-lib
          libdrm
          mesa
          libGL
          libxkbcommon
          systemd # libudev.so.1
          xorg.libX11
          xorg.libXcomposite
          xorg.libXdamage
          xorg.libXext
          xorg.libXfixes
          xorg.libXrandr
          xorg.libxcb
          xorg.libXtst
          xorg.libXScrnSaver
        ];

        # Native-module toolchain: nothing in this app currently needs it
        # (electron-builder's npmRebuild is disabled), but node-gyp support
        # costs little to keep around for whatever gets added to package.json.
        buildTools = with pkgs; [
          nodejs_22
          python3
          gcc
          gnumake
          pkg-config
        ];

        fhsEnv = pkgs.buildFHSEnv {
          name = "tattoowarp-dev";
          targetPkgs = pkgs: buildTools ++ electronRuntimeLibs;
        };
      in
      {
        # `nix develop` drops you into an FHS-compatible shell (via
        # buildFHSEnv's `.env`) with Node.js and everything Electron's
        # prebuilt binaries expect at runtime — covers both `npm run build`
        # and actually launching the Electron app locally on NixOS.
        #
        # This shell only provides the *toolchain*. The actual Linux/Windows/
        # macOS installers are built by `electron-builder` (via `npm run
        # dist`/`dist:linux`/`dist:win`/`dist:mac`, see app/README.md), which
        # needs network access to fetch prebuilt Electron binaries per
        # platform — that part isn't sandboxed as a pure Nix derivation here,
        # the same way most Electron projects don't build hermetically.
        devShells.default = fhsEnv.env;

        apps.fhs = {
          type = "app";
          program = "${fhsEnv}/bin/tattoowarp-dev";
        };
      }
    );
}
