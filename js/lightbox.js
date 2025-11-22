// Security: Escape HTML special characters to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Security: Escape for use in CSS url() - only allow safe characters
function escapeUrl(url) {
    if (!url) return '';
    // Only allow http(s) URLs and relative paths, encode special chars
    return encodeURI(url).replace(/'/g, '%27').replace(/"/g, '%22');
}

// Security: Validate video ID (alphanumeric, dash, underscore only)
function sanitizeVideoId(id) {
    if (!id) return '';
    return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

function is_youtubelink(url) {
    var p = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
    return (url.match(p)) ? RegExp.$1 : false;
}
function is_imagelink(url) {
    var p = /([a-z\-_0-9\/\:\.]*\.(jpg|jpeg|png|gif))/i;
    return (url.match(p)) ? true : false;
}
function is_vimeolink(url,el) {
    var id = false;
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == XMLHttpRequest.DONE) {   // XMLHttpRequest.DONE == 4
            if (xmlhttp.status == 200) {
                var response = JSON.parse(xmlhttp.responseText);
                id = response.video_id;
                console.log(id);
                el.classList.add('lightbox-vimeo');
                el.setAttribute('data-id',id);

                el.addEventListener("click", function(event) {
                    event.preventDefault();
                    var safeId = sanitizeVideoId(el.getAttribute('data-id'));
                    document.getElementById('lightbox').innerHTML = '<a id="close"></a><a id="next">&rsaquo;</a><a id="prev">&lsaquo;</a><div class="videoWrapperContainer"><div class="videoWrapper"><iframe src="https://player.vimeo.com/video/'+safeId+'/?autoplay=1&byline=0&title=0&portrait=0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div></div>';
                    document.getElementById('lightbox').style.display = 'block';

                    setGallery(this);
                });
            }
            else if (xmlhttp.status == 400) {
                alert('There was an error 400');
            }
            else {
                alert('something else other than 200 was returned');
            }
        }
    };
    xmlhttp.open("GET", 'https://vimeo.com/api/oembed.json?url='+url, true);
    xmlhttp.send();
}
function setGallery(el) {
    var elements = document.body.querySelectorAll(".gallery");
    elements.forEach(element => {
        element.classList.remove('gallery');
	});
	if(el.closest('ul, p')) {
		var link_elements = el.closest('ul, p').querySelectorAll("a[class*='lightbox-']");
		link_elements.forEach(link_element => {
			link_element.classList.remove('current');
		});
		link_elements.forEach(link_element => {
			if(el.getAttribute('href') == link_element.getAttribute('href')) {
				link_element.classList.add('current');
			}
		});
		if(link_elements.length>1) {
			document.getElementById('lightbox').classList.add('gallery');
			link_elements.forEach(link_element => {
				link_element.classList.add('gallery');
			});
		}
		var currentkey;
		var gallery_elements = document.querySelectorAll('a.gallery');
		Object.keys(gallery_elements).forEach(function (k) {
			if(gallery_elements[k].classList.contains('current')) currentkey = k;
		});
		if(currentkey==(gallery_elements.length-1)) var nextkey = 0;
		else var nextkey = parseInt(currentkey)+1;
		if(currentkey==0) var prevkey = parseInt(gallery_elements.length-1);
		else var prevkey = parseInt(currentkey)-1;
		document.getElementById('next').addEventListener("click", function() {
			gallery_elements[nextkey].click();
		});
		document.getElementById('prev').addEventListener("click", function() {
			gallery_elements[prevkey].click();
		});
	}
}

document.addEventListener("DOMContentLoaded", function() {

    //create lightbox div in the footer
    var newdiv = document.createElement("div");
    newdiv.setAttribute('id',"lightbox");
    document.body.appendChild(newdiv);

    //add classes to links to be able to initiate lightboxes
    var elements = document.querySelectorAll('a');
    elements.forEach(element => {
        var url = element.getAttribute('href');
        if(url) {
            if(url.indexOf('vimeo') !== -1 && !element.classList.contains('no-lightbox')) {
                is_vimeolink(url,element);
            }
            if(is_youtubelink(url) && !element.classList.contains('no-lightbox')) {
                element.classList.add('lightbox-youtube');
                element.setAttribute('data-id',is_youtubelink(url));
            }
            if(is_imagelink(url) && !element.classList.contains('no-lightbox')) {
                element.classList.add('lightbox-image');
                var href = element.getAttribute('href');
                var filename = href.split('/').pop();
                var split = filename.split(".");
                var name = split[0];
                element.setAttribute('title',name);
            }
        }
    });

    //remove the clicked lightbox
    document.getElementById('lightbox').addEventListener("click", function(event) {
        if(event.target.id != 'next' && event.target.id != 'prev'){
            this.innerHTML = '';
            document.getElementById('lightbox').style.display = 'none';
        }
    });

    //add the youtube lightbox on click
    var elements = document.querySelectorAll('a.lightbox-youtube');
    elements.forEach(element => {
        element.addEventListener("click", function(event) {
            event.preventDefault();
            var safeId = sanitizeVideoId(this.getAttribute('data-id'));
            document.getElementById('lightbox').innerHTML = '<a id="close"></a><a id="next">&rsaquo;</a><a id="prev">&lsaquo;</a><div class="videoWrapperContainer"><div class="videoWrapper"><iframe src="https://www.youtube.com/embed/'+safeId+'?autoplay=1&showinfo=0&rel=0"></iframe></div>';
            document.getElementById('lightbox').style.display = 'block';

            setGallery(this);
        });
    });

    //add the image lightbox on click
    var elements = document.querySelectorAll('a.lightbox-image');
    elements.forEach(element => {
        element.addEventListener("click", function(event) {
            event.preventDefault();
            var photoName = this.getAttribute('data-photo') || '';
            var safePhotoName = escapeHtml(photoName);
            var safeHref = escapeUrl(this.getAttribute('href'));
            var safeTitle = escapeHtml(this.getAttribute('title'));

            // Build lightbox HTML with escaped values
            var lightbox = document.getElementById('lightbox');
            lightbox.innerHTML = '';

            // Create elements safely
            var closeBtn = document.createElement('a');
            closeBtn.id = 'close';
            lightbox.appendChild(closeBtn);

            var nextBtn = document.createElement('a');
            nextBtn.id = 'next';
            nextBtn.innerHTML = '&rsaquo;';
            lightbox.appendChild(nextBtn);

            var prevBtn = document.createElement('a');
            prevBtn.id = 'prev';
            prevBtn.innerHTML = '&lsaquo;';
            lightbox.appendChild(prevBtn);

            var imgDiv = document.createElement('div');
            imgDiv.className = 'img';
            imgDiv.style.background = "url('" + safeHref + "') center center / contain no-repeat";
            imgDiv.title = safeTitle;

            var img = document.createElement('img');
            img.src = safeHref;
            img.alt = safeTitle;
            imgDiv.appendChild(img);
            lightbox.appendChild(imgDiv);

            var titleSpan = document.createElement('span');
            titleSpan.textContent = safeTitle;
            lightbox.appendChild(titleSpan);

            // Create likes section
            var likesDiv = document.createElement('div');
            likesDiv.className = 'lightbox-likes';
            likesDiv.setAttribute('data-photo', safePhotoName);

            var likeBtn = document.createElement('button');
            likeBtn.className = 'like-button';
            likeBtn.setAttribute('aria-label', 'Like photo');
            // Use addEventListener instead of inline onclick (safer)
            likeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof toggleLike === 'function') {
                    toggleLike(photoName, this);
                }
            });

            var heartSpan = document.createElement('span');
            heartSpan.className = 'heart';
            heartSpan.textContent = '🤍';
            likeBtn.appendChild(heartSpan);

            var countSpan = document.createElement('span');
            countSpan.className = 'like-count';
            countSpan.textContent = '0';
            likeBtn.appendChild(countSpan);

            likesDiv.appendChild(likeBtn);
            lightbox.appendChild(likesDiv);

            lightbox.style.display = 'block';

            setGallery(this);

            // Load like status for this photo
            if(photoName && typeof loadLikeStatus === 'function') {
                loadLikeStatus(photoName, likesDiv);
            }
        });
    });

});
