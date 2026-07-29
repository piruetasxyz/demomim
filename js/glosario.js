fetch('./../datos/glosario.yaml')
    .then(response => response.text())
    .then(yamlText => {
        const data = jsyaml.load(yamlText);
        const container = document.querySelector('#divGlosario');
        container.innerHTML = '';
        data.glosario.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'glosario-item';
            itemDiv.innerHTML = `<h2>${item.pregunta}</h2>`;

            Object.values(item.definiciones).forEach(definicion => {
                const definicionDiv = document.createElement('div');
                definicionDiv.className = 'glosario-definicion';

                if (definicion.texto) {
                    const textoP = document.createElement('p');
                    textoP.className = 'glosario-texto';
                    textoP.textContent = definicion.texto;
                    definicionDiv.appendChild(textoP);
                }

                if (definicion.imagen) {
                    const imagenElement = document.createElement('img');
                    imagenElement.src = `./../glosario-imagenes/${definicion.imagen}`;
                    imagenElement.alt = `${item.concepto} - ${definicion.persona}`;
                    imagenElement.className = 'glosario-imagen';
                    imagenElement.loading = 'lazy';
                    definicionDiv.appendChild(imagenElement);
                }

                const firmaP = document.createElement('p');
                firmaP.className = 'glosario-firma';
                firmaP.innerHTML = `<strong>${definicion.persona}</strong>${definicion.contexto ? ` — ${definicion.contexto}` : ''}`;
                definicionDiv.appendChild(firmaP);

                itemDiv.appendChild(definicionDiv);
            });

            container.appendChild(itemDiv);
        });
    })
    .catch(error => console.error('Error al cargar el YAML:', error));
