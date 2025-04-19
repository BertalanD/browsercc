FROM ubuntu:24.04

RUN apt update && apt install -y \
    build-essential \
    cmake \
    git \
    python3 \
    curl \
    ninja-build && \
    rm -rf /var/lib/apt/lists/*

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN bash -c "source ${NVM_DIR}/nvm.sh && nvm install 23"

ENV EMSDK_DIR=/root/emsdk
RUN git -C /root clone --depth=1 https://github.com/emscripten-core/emsdk.git
RUN ${EMSDK_DIR}/emsdk install latest && ${EMSDK_DIR}/emsdk activate latest

ENTRYPOINT ["bash", "-c", "source $NVM_DIR/nvm.sh source && source $EMSDK_DIR/emsdk_env.sh && exec \"$@\"", "--"]