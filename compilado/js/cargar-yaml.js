fetch('./coleccion.yaml')
            .then(response => response.text())
            .then(yamlText => {
                const data = jsyaml.load(yamlText);
                const container = document.querySelector('#divColeccion');
                container.innerHTML = '';
                data.coleccion.articulos.forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.innerHTML = `<h2>${item.codigo}</h2><p>${item.titulo}</p>`;
                    // agregar autorxs
                    item.autorxs.forEach(autor => {
                        itemDiv.innerHTML += `<p>${autor} </p>`;
                    });
                    // agregar editoriales
                    item.editoriales.forEach(editorial => {
                        itemDiv.innerHTML += `<p>${editorial} </p>`;
                    });
                    container.appendChild(itemDiv);
                    // agregar agno
                    itemDiv.innerHTML += `<p>${item.agno} </p>`;
                    // agregar estado
                    itemDiv.innerHTML += `<p>${item.estado} </p>`;
                    // cargar imagen
                    if (item.imagenes) {
                        item.imagenes.forEach(async (imagen) => {
                            const imgElement = document.createElement('img');
                            imgElement.src = `./imagenes/${imagen}`;
                            imgElement.alt = item.titulo;
                            imgElement.className = "coleccion-imagen";
                            itemDiv.appendChild(imgElement);
                             // 🔥 WAIT for image to load, then resize
                            imgElement.onload = () => {
                                resizeImage(imgElement, 800, 0.6);
                            };
                        });
                    }
                });
            })
            .catch(error => console.error('Error al cargar el YAML:', error));


function resizeImage(imgElement, maxWidth = 150, quality = 0.7) {
  const lienzo = document.createElement("canvas");
  const escala = maxWidth / imgElement.naturalWidth;

  lienzo.width = maxWidth;
  lienzo.height = imgElement.naturalHeight * escala;

  const ctx = lienzo.getContext("2d");
  ctx.drawImage(imgElement, 0, 0, lienzo.width, lienzo.height);

  const compressed = lienzo.toDataURL("image/webp", quality);
  imgElement.src = compressed;
}